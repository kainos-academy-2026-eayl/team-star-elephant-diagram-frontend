import type { Request, Response } from "express";
import { type BackendApi, BackendApiError } from "../backendApi";

export interface LoginResponse {
	accessToken: string;
	expiresIn: number;
}

type SessionCredentials = { result: LoginResponse; cookies: string[] };
type RefreshOperation = {
	promise: Promise<SessionCredentials>;
	invalidated: boolean;
	users: number;
	responses: Set<Response>;
};

const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: true,
	sameSite: "strict",
	path: "/",
} as const;

function cookieValue(req: Request, name: string): string | undefined {
	const matches = (req.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(`${name}=`));
	if (matches.length !== 1) return undefined;
	const value = matches[0]?.slice(name.length + 1);
	return value && /^[A-Za-z0-9._-]+$/.test(value) ? value : undefined;
}

// Thrown when a refresh token was presented and the backend rejected it.
export class SessionExpiredError extends BackendApiError {
	constructor(message = "Your session has expired.") {
		super(401, message);
	}
}

export class CustomerSessionError extends BackendApiError {
	constructor() {
		super(403, "Customer sessions cannot access staff resources.");
	}
}

export class SessionService {
	private readonly refreshedAccess = new WeakMap<Request, string>();
	private readonly establishedResponses = new WeakSet<Response>();
	private readonly clearedResponses = new WeakSet<Response>();
	private readonly refreshOperations = new Map<string, RefreshOperation>();
	private readonly renewedForRequest = new WeakMap<
		Request,
		{ credentials: SessionCredentials; operation: RefreshOperation }
	>();

	constructor(private readonly api: BackendApi) {}

	establish(
		res: Response,
		credentials: { result: LoginResponse; cookies: string[] },
	): void {
		if (
			typeof credentials.result.accessToken !== "string" ||
			credentials.result.expiresIn !== 900 ||
			!credentials.cookies.some((cookie) => cookie.startsWith("refreshToken="))
		) {
			throw new Error("Backend returned incomplete session credentials");
		}
		if (this.establishedResponses.has(res)) return;
		this.establishedResponses.add(res);
		this.write(res, credentials);
	}

	async request<Result>(
		path: string,
		req: Request,
		res: Response,
		headers: Record<string, string> = {},
		body?: Record<string, string | number>,
		method?: string,
	): Promise<Result> {
		res.set("Cache-Control", "no-store");
		const renewed = this.renewedForRequest.get(req);
		if (renewed) {
			return this.requestWithCredentials(
				path,
				req,
				res,
				headers,
				body,
				renewed,
				method,
			);
		}
		const authorization =
			this.refreshedAccess.get(req) ?? req.get("authorization");
		const access = cookieValue(req, "accessToken");
		if (authorization || access) {
			try {
				return await this.api.request<Result>(
					path,
					body,
					{
						...headers,
						Authorization: authorization ?? `Bearer ${access}`,
					},
					method,
				);
			} catch (error) {
				if (!(error instanceof BackendApiError) || error.status !== 401)
					throw error;
				const renewedAfterFailure = this.renewedForRequest.get(req);
				if (renewedAfterFailure) {
					return this.requestWithCredentials(
						path,
						req,
						res,
						headers,
						body,
						renewedAfterFailure,
						method,
					);
				}
			}
		}
		const refresh = cookieValue(req, "refreshToken");
		if (!refresh) throw new BackendApiError(401, "Please log in.");
		let operation = this.refreshOperations.get(refresh);
		if (!operation) {
			operation = {
				promise: this.api.requestWithResponse<LoginResponse>(
					"/auth/refresh",
					{},
					{
						Cookie: `refreshToken=${refresh}`,
					},
				),
				invalidated: false,
				users: 0,
				responses: new Set(),
			};
			this.refreshOperations.set(refresh, operation);
		}
		operation.users += 1;
		this.trackResponse(refresh, operation, res);
		let credentials: SessionCredentials | undefined;
		try {
			try {
				credentials = await operation.promise;
			} catch (error) {
				if (error instanceof BackendApiError && error.status === 401) {
					throw new SessionExpiredError();
				}
				throw error;
			}
			if (!operation.invalidated) {
				this.renewedForRequest.set(req, { credentials, operation });
			}
			const result = await this.api.request<Result>(
				path,
				body,
				{
					...headers,
					Authorization: `Bearer ${credentials.result.accessToken}`,
				},
				method,
			);
			if (!operation.invalidated)
				this.establishForRequest(req, res, credentials);
			return result;
		} catch (error) {
			if (
				error instanceof BackendApiError &&
				error.status === 403 &&
				credentials &&
				this.tokenKind(credentials.result.accessToken) === "customer"
			) {
				if (!operation.invalidated)
					this.establishForRequest(req, res, credentials);
				throw new CustomerSessionError();
			}
			if (error instanceof BackendApiError && error.status === 401) {
				this.refreshedAccess.delete(req);
				this.renewedForRequest.delete(req);
				this.clear(res);
			} else if (credentials && !operation.invalidated) {
				this.establishForRequest(req, res, credentials);
			}
			throw error;
		} finally {
			operation.users -= 1;
			this.cleanupRefreshOperation(refresh, operation);
		}
	}

	private async requestWithCredentials<Result>(
		path: string,
		req: Request,
		res: Response,
		headers: Record<string, string>,
		body: Record<string, string | number> | undefined,
		renewed: { credentials: SessionCredentials; operation: RefreshOperation },
		method?: string,
	): Promise<Result> {
		const { credentials, operation } = renewed;
		try {
			const result = await this.api.request<Result>(
				path,
				body,
				{
					...headers,
					Authorization: ["Bearer", credentials.result.accessToken].join(" "),
				},
				method,
			);
			if (!operation.invalidated) this.establish(res, credentials);
			return result;
		} catch (error) {
			if (
				error instanceof BackendApiError &&
				error.status === 403 &&
				this.tokenKind(credentials.result.accessToken) === "customer"
			) {
				if (!operation.invalidated)
					this.establishForRequest(req, res, credentials);
				throw new CustomerSessionError();
			}
			if (error instanceof BackendApiError && error.status === 401) {
				this.refreshedAccess.delete(req);
				this.renewedForRequest.delete(req);
				this.clear(res);
			} else if (!operation.invalidated) {
				this.establishForRequest(req, res, credentials);
			}
			throw error;
		}
	}

	// Reads the unverified `kind` claim for routing only; the backend still verifies every token.
	accessTokenKind(req: Request): string | undefined {
		const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
		const token = bearer?.[1] ?? cookieValue(req, "accessToken");
		return this.tokenKind(token);
	}

	private tokenKind(token: string | undefined): string | undefined {
		const payload = token?.split(".")[1];
		if (!payload) return undefined;
		try {
			const claims: unknown = JSON.parse(
				Buffer.from(payload, "base64url").toString("utf8"),
			);
			return claims &&
				typeof claims === "object" &&
				"kind" in claims &&
				typeof claims.kind === "string"
				? claims.kind
				: undefined;
		} catch {
			return undefined;
		}
	}

	async logout(req: Request, res: Response): Promise<void> {
		this.refreshedAccess.delete(req);
		this.renewedForRequest.delete(req);
		const refresh = cookieValue(req, "refreshToken");
		if (refresh) {
			const operation = this.refreshOperations.get(refresh);
			if (operation) this.invalidate(operation);
		}
		await this.api.request(
			"/auth/logout",
			{},
			refresh ? { Cookie: `refreshToken=${refresh}` } : {},
		);
		if (refresh) {
			const operation = this.refreshOperations.get(refresh);
			if (operation) this.invalidate(operation);
		}
		this.clear(res);
	}

	private establishForRequest(
		req: Request,
		res: Response,
		credentials: { result: LoginResponse; cookies: string[] },
	): void {
		this.establish(res, credentials);
		// Later API calls still see the original browser cookies on this request.
		this.refreshedAccess.set(req, `Bearer ${credentials.result.accessToken}`);
	}

	private trackResponse(
		refresh: string,
		operation: RefreshOperation,
		res: Response,
	): void {
		if (operation.responses.has(res)) return;
		operation.responses.add(res);
		let released = false;
		const release = (): void => {
			if (released) return;
			released = true;
			res.off("finish", release);
			res.off("close", release);
			operation.responses.delete(res);
			this.cleanupRefreshOperation(refresh, operation);
		};
		res.once("finish", release);
		res.once("close", release);
	}

	private cleanupRefreshOperation(
		refresh: string,
		operation: RefreshOperation,
	): void {
		if (
			operation.users === 0 &&
			operation.responses.size === 0 &&
			this.refreshOperations.get(refresh) === operation
		) {
			this.refreshOperations.delete(refresh);
		}
	}

	private invalidate(operation: RefreshOperation): void {
		operation.invalidated = true;
		for (const res of operation.responses) {
			if (res.headersSent) continue;
			const header = res.getHeader("Set-Cookie");
			if (!header) continue;
			const cookies = (Array.isArray(header) ? header : [header]).map(String);
			const remaining = cookies.filter(
				(cookie) => !/^(?:accessToken|refreshToken)=/.test(cookie),
			);
			if (remaining.length) res.setHeader("Set-Cookie", remaining);
			else res.removeHeader("Set-Cookie");
		}
	}

	private write(
		res: Response,
		credentials: { result: LoginResponse; cookies: string[] },
	): void {
		res.set("Cache-Control", "no-store");
		res.cookie("accessToken", credentials.result.accessToken, {
			...COOKIE_OPTIONS,
			maxAge: credentials.result.expiresIn * 1000,
		});
		for (const cookie of credentials.cookies) {
			if (cookie.startsWith("refreshToken=")) {
				res.append("Set-Cookie", cookie.replace(/;\s*Domain\s*=[^;]*/gi, ""));
			}
		}
	}

	private clear(res: Response): void {
		if (this.clearedResponses.has(res)) return;
		this.clearedResponses.add(res);
		res.clearCookie("accessToken", COOKIE_OPTIONS);
		res.clearCookie("refreshToken", COOKIE_OPTIONS);
	}
}
