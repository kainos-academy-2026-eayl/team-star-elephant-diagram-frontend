import type { Request, Response } from "express";
import { type BackendApi, BackendApiError } from "../backendApi";

export interface LoginResponse {
	accessToken: string;
	expiresIn: number;
}

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

export class SessionService {
	private readonly refreshing = new Map<
		string,
		{
			promise: Promise<{ result: LoginResponse; cookies: string[] }>;
			invalidated: boolean;
			users: number;
		}
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
		this.write(res, credentials);
	}

	async request<Result>(
		path: string,
		req: Request,
		res: Response,
	): Promise<Result> {
		res.set("Cache-Control", "no-store");
		const authorization = req.get("authorization");
		const access = cookieValue(req, "accessToken");
		if (authorization || access) {
			try {
				return await this.api.request<Result>(path, undefined, {
					Authorization: authorization ?? `Bearer ${access}`,
				});
			} catch (error) {
				if (!(error instanceof BackendApiError) || error.status !== 401)
					throw error;
			}
		}
		const refresh = cookieValue(req, "refreshToken");
		if (!refresh) throw new BackendApiError(401, "Please log in.");
		let operation = this.refreshing.get(refresh);
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
			};
			this.refreshing.set(refresh, operation);
		}
		operation.users += 1;
		try {
			const credentials = await operation.promise;
			const result = await this.api.request<Result>(path, undefined, {
				Authorization: `Bearer ${credentials.result.accessToken}`,
			});
			if (!operation.invalidated) this.establish(res, credentials);
			return result;
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401)
				this.clear(res);
			throw error;
		} finally {
			operation.users -= 1;
			if (operation.users === 0 && this.refreshing.get(refresh) === operation)
				this.refreshing.delete(refresh);
		}
	}

	async logout(req: Request, res: Response): Promise<void> {
		const refresh = cookieValue(req, "refreshToken");
		if (refresh) {
			const operation = this.refreshing.get(refresh);
			if (operation) operation.invalidated = true;
		}
		await this.api.request(
			"/auth/logout",
			{},
			refresh ? { Cookie: `refreshToken=${refresh}` } : {},
		);
		if (refresh) {
			const operation = this.refreshing.get(refresh);
			if (operation) operation.invalidated = true;
		}
		this.clear(res);
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
		res.clearCookie("accessToken", COOKIE_OPTIONS);
		res.clearCookie("refreshToken", COOKIE_OPTIONS);
	}
}
