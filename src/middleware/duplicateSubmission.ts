import { createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const SUBMISSION_FIELD = "_submission";

const TOKEN_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SKIPPED_HEADERS = new Set([
	"connection",
	"date",
	"keep-alive",
	"transfer-encoding",
]);

type CapturedResponse = {
	status: number;
	headers: [string, number | string | string[]][];
	body: Buffer;
};

type Submission = {
	result: Promise<CapturedResponse | undefined>;
	expiresAt: number;
};

export const createSubmissionToken = (): string => randomUUID();

/**
 * Replaces client-side double-submit prevention: each rendered form carries a
 * one-time token, and a repeated POST with the same token (e.g. a double-click)
 * waits for the first request and receives its response instead of repeating
 * the action.
 */
export function preventDuplicateSubmissions({
	windowMs = 30_000,
	timeoutMs = 30_000,
	maxEntries = 10_000,
	now = Date.now,
}: {
	windowMs?: number;
	timeoutMs?: number;
	maxEntries?: number;
	now?: () => number;
} = {}) {
	const submissions = new Map<string, Submission>();

	const prune = () => {
		const time = now();
		for (const [key, submission] of submissions) {
			if (submission.expiresAt <= time) submissions.delete(key);
		}
		while (submissions.size >= maxEntries) {
			const oldest = submissions.keys().next().value;
			if (oldest === undefined) break;
			submissions.delete(oldest);
		}
	};

	return (req: Request, res: Response, next: NextFunction): void => {
		if (req.method !== "POST" || !req.body || typeof req.body !== "object") {
			next();
			return;
		}
		const token: unknown = req.body[SUBMISSION_FIELD];
		delete req.body[SUBMISSION_FIELD];
		if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
			next();
			return;
		}

		// Scope tokens to the requester so a response is only replayed to the same session.
		const key = createHash("sha256")
			.update(`${token}\0${req.originalUrl}\0${req.headers.cookie ?? ""}`)
			.digest("hex");
		prune();

		const existing = submissions.get(key);
		if (existing) {
			existing.result.then((captured) => {
				if (!captured) {
					next();
					return;
				}
				res.status(captured.status);
				for (const [name, value] of captured.headers) {
					res.setHeader(name, value);
				}
				res.end(captured.body);
			}, next);
			return;
		}

		let resolveResult: (captured: CapturedResponse | undefined) => void =
			() => {};
		const submission: Submission = {
			result: new Promise((resolve) => {
				resolveResult = resolve;
			}),
			expiresAt: Number.POSITIVE_INFINITY,
		};
		submissions.set(key, submission);
		// The browser aborts the first request on a double-click, so settle when the
		// handler finishes rather than when the connection closes.
		const timer = setTimeout(() => settle(undefined), timeoutMs);
		timer.unref();
		const settle = (captured: CapturedResponse | undefined) => {
			clearTimeout(timer);
			if (submission.expiresAt === Number.POSITIVE_INFINITY) {
				submission.expiresAt = now() + windowMs;
			}
			resolveResult(captured);
		};

		let streamed = false;
		const originalWrite = res.write;
		const originalEnd = res.end;
		res.write = function (this: Response, ...args: unknown[]) {
			streamed = true;
			return Reflect.apply(originalWrite, this, args);
		} as Response["write"];
		res.end = function (this: Response, ...args: unknown[]) {
			const [chunk, encoding] = args;
			let body: Buffer | undefined;
			if (Buffer.isBuffer(chunk)) {
				body = chunk;
			} else if (typeof chunk === "string") {
				body = Buffer.from(
					chunk,
					typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8",
				);
			} else if (chunk === undefined || typeof chunk === "function") {
				body = Buffer.alloc(0);
			}
			settle(
				streamed || !body
					? undefined
					: {
							status: res.statusCode,
							headers: Object.entries(res.getHeaders()).flatMap(
								([name, value]) =>
									value === undefined || SKIPPED_HEADERS.has(name)
										? []
										: [[name, value] as [string, number | string | string[]]],
							),
							body,
						},
			);
			return Reflect.apply(originalEnd, this, args);
		} as Response["end"];

		next();
	};
}
