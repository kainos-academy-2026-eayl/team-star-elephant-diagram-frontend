import type { Response as ExpressResponse, Request } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { BackendApi, BackendApiError } from "../../backendApi";
import {
	CustomerSessionError,
	type LoginResponse,
	SessionExpiredError,
	SessionService,
} from "../../services/sessionService";

const profile = {
	user: {
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		memberSince: "2026-01-01",
	},
	orders: [],
};
const dashboard = {
	staff: { name: "Ada" },
	error: "Dashboard metrics are not implemented yet.",
};
const response = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const credentials = () =>
	new Response(JSON.stringify({ accessToken: "new-access", expiresIn: 900 }), {
		headers: {
			"Set-Cookie":
				"refreshToken=new-refresh; Max-Age=604700; Path=/; HttpOnly; Secure; SameSite=Strict",
		},
	});

describe("persistent authentication", () => {
	it.each(["/login", "/admin/login"])(
		"accepts same-origin HTTPS login at %s",
		async (path) => {
			const api = vi.fn<typeof fetch>().mockResolvedValueOnce(credentials());
			const result = await request(createApp({ fetch: api }))
				.post(path)
				.set("Host", "localhost:3000")
				.set("Origin", "https://localhost:3000")
				.type("form")
				.send({ email: "ada@example.com", password: "correct-horse" });
			expect(result.status).toBe(303);
			expect(result.headers["set-cookie"]).toHaveLength(2);
			expect(api).toHaveBeenCalledTimes(1);
		},
	);

	it("strips the backend cookie domain while preserving refresh-cookie expiry", async () => {
		const api = vi.fn<typeof fetch>().mockResolvedValueOnce(
			new Response(
				JSON.stringify({ accessToken: "new-access", expiresIn: 900 }),
				{
					headers: {
						"Set-Cookie":
							"refreshToken=new-refresh; Domain=backend.local; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/; HttpOnly; Secure; SameSite=Strict",
					},
				},
			),
		);
		const result = await request(createApp({ fetch: api }))
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "correct-horse" });
		const refreshCookie = String(result.headers["set-cookie"]);
		expect(refreshCookie).toContain("Expires=Wed, 21 Oct 2037 07:28:00 GMT");
		expect(refreshCookie).not.toContain("Domain=backend.local");
	});

	it.each(["customer", "admin"])(
		"restores %s login using only a refresh cookie after reload/access expiry",
		async (kind) => {
			const api = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(credentials())
				.mockResolvedValueOnce(
					response(kind === "admin" ? dashboard : profile),
				);
			const result = await request(createApp({ fetch: api }))
				.get(kind === "admin" ? "/admin" : "/profile")
				.set("Cookie", "refreshToken=existing-refresh");
			expect(result.status).toBe(200);
			expect(result.text).toContain("Ada");
			expect(String(api.mock.calls[0]?.[0])).toContain("/auth/refresh");
			expect(api.mock.calls[0]?.[1]?.headers).toMatchObject({
				Cookie: "refreshToken=existing-refresh",
			});
			expect(api.mock.calls[1]?.[1]?.headers).toMatchObject({
				Authorization: "Bearer new-access",
			});
			expect(result.headers["cache-control"]).toBe("no-store");
			expect(result.headers["set-cookie"]).toHaveLength(2);
			for (const cookie of result.headers["set-cookie"] ?? []) {
				expect(cookie).toContain("HttpOnly");
				expect(cookie).toContain("Secure");
				expect(cookie).toContain("SameSite=Strict");
			}
			expect(result.text).not.toContain("new-access");
			expect(result.text).not.toContain("new-refresh");
		},
	);

	it("refreshes once and retries with the new token when the backend rejects an expired access token", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(response({ error: "Expired" }, 401))
			.mockResolvedValueOnce(credentials())
			.mockResolvedValueOnce(response(profile));
		const result = await request(createApp({ fetch: api }))
			.get("/profile")
			.set(
				"Cookie",
				"accessToken=expired-access; refreshToken=current-refresh",
			);
		expect(result.status).toBe(200);
		expect(api.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: "Bearer expired-access",
		});
		expect(api.mock.calls[2]?.[1]?.headers).toMatchObject({
			Authorization: "Bearer new-access",
		});
		expect(api).toHaveBeenCalledTimes(3);
	});

	it("returns to login and expires both cookies when refresh is rejected", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(response({ error: "Expired refresh" }, 401));
		const result = await request(createApp({ fetch: api }))
			.get("/profile")
			.set("Cookie", "refreshToken=expired-refresh");
		expect(result.status).toBe(303);
		expect(result.headers.location).toBe("/login");
		expect(api).toHaveBeenCalledTimes(1);
		expect(result.headers["set-cookie"]).toHaveLength(2);
		for (const cookie of result.headers["set-cookie"] ?? []) {
			expect(cookie).toMatch(/^(accessToken|refreshToken)=;/);
			expect(
				Date.parse(cookie.match(/Expires=([^;]+)/)?.[1] ?? ""),
			).toBeLessThan(Date.now());
			expect(cookie).toContain("Secure");
		}
	});

	it("does not turn a refresh outage into a successful login or clear a valid session", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Service unavailable"));
		const result = await request(createApp({ fetch: api }))
			.get("/profile")
			.set("Cookie", "refreshToken=current-refresh");
		expect(result.status).toBe(503);
		expect(result.headers["set-cookie"]).toBeUndefined();
	});

	it("shows access denied for forbidden admin requests and does not retry them", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(response({ error: "Forbidden" }, 403));
		const result = await request(createApp({ fetch: api }))
			.get("/admin")
			.set(
				"Cookie",
				"accessToken=customer-access; refreshToken=customer-refresh",
			);
		expect(result.status).toBe(403);
		expect(result.headers.location).toBeUndefined();
		expect(result.text).toContain("Access denied");
		expect(api).toHaveBeenCalledTimes(1);

		const rejected = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(credentials())
			.mockResolvedValueOnce(response({ error: "Unauthorized" }, 401));
		const retry = await request(createApp({ fetch: rejected }))
			.get("/admin")
			.set("Cookie", "refreshToken=current");
		expect(retry.status).toBe(303);
		expect(retry.headers.location).toBe("/admin/login");
		expect(rejected).toHaveBeenCalledTimes(2);
	});

	it("persists refreshed credentials when a staff retry fails with a non-401 response", async () => {
		const api = vi.fn<typeof fetch>((input) => {
			const path = String(input);
			if (path.endsWith("/auth/refresh")) return Promise.resolve(credentials());
			if (path.endsWith("/admin/users/999")) {
				return Promise.resolve(response({ error: "Not found" }, 404));
			}
			return Promise.resolve(
				response({
					staff: { name: "Ada" },
					sections: [],
					quickActions: [],
				}),
			);
		});
		const result = await request(createApp({ fetch: api }))
			.get("/admin/users/999")
			.set("Cookie", "refreshToken=current-refresh");
		expect(result.status).toBe(404);
		expect(result.headers["set-cookie"]).toHaveLength(2);
		expect(String(result.headers["set-cookie"])).toContain(
			"accessToken=new-access",
		);
		expect(String(result.headers["set-cookie"])).toContain(
			"refreshToken=new-refresh",
		);
	});

	it("reuses refreshed credentials when a paired admin lookup returns a delayed 401", async () => {
		let resolveDetailsRetry!: () => void;
		const detailsRetry = new Promise<void>((resolve) => {
			resolveDetailsRetry = resolve;
		});
		const api = vi.fn<typeof fetch>(async (input, init) => {
			const path = String(input);
			const authorization = (
				init?.headers as Record<string, string> | undefined
			)?.Authorization;
			if (path.endsWith("/auth/refresh")) return credentials();
			if (path.endsWith("/admin/users/7")) {
				if (authorization === ["Bearer", "expired-access"].join(" ")) {
					return response({ error: "Expired" }, 401);
				}
				resolveDetailsRetry();
				return response({
					user: {
						id: 7,
						name: "Ada Lovelace",
						email: "ada@example.com",
						registeredAt: "2026-01-01",
						status: "active",
					},
					recentOrders: [],
					basket: { itemCount: 0, subtotal: 0, items: [] },
				});
			}
			if (path.endsWith("/admin")) {
				if (authorization === ["Bearer", "expired-access"].join(" ")) {
					await detailsRetry;
					return response({ error: "Expired" }, 401);
				}
				return response({
					staff: { name: "Ada" },
					sections: [{ label: "Users" }],
					quickActions: [{ label: "Suspend or reactivate customers" }],
				});
			}
			return response({ error: "Unexpected URL" }, 500);
		});
		const result = await request(createApp({ fetch: api }))
			.get("/admin/users/7")
			.set(
				"Cookie",
				"accessToken=expired-access; refreshToken=current-refresh",
			);

		expect(result.status).toBe(200);
		expect(
			api.mock.calls.filter(([input]) =>
				String(input).endsWith("/auth/refresh"),
			),
		).toHaveLength(1);
		expect(
			api.mock.calls.filter(
				([input, init]) =>
					(String(input).endsWith("/admin") ||
						String(input).endsWith("/admin/users/7")) &&
					(init?.headers as Record<string, string> | undefined)
						?.Authorization === ["Bearer", "new-access"].join(" "),
			),
		).toHaveLength(2);
		expect(String(result.headers["set-cookie"])).toContain(
			"accessToken=new-access",
		);
		expect(String(result.headers["set-cookie"])).toContain(
			"refreshToken=new-refresh",
		);
	});

	it("offers a working separate admin login", async () => {
		const api = vi.fn<typeof fetch>().mockResolvedValueOnce(credentials());
		const app = createApp({ fetch: api });
		const form = await request(app).get("/admin/login");
		expect(form.text).toContain('action="/admin/login"');
		const result = await request(app)
			.post("/admin/login")
			.type("form")
			.send({ email: "admin@example.com", password: "correct-horse" });
		expect(result.status).toBe(303);
		expect(result.headers.location).toBe("/admin");
		expect(String(api.mock.calls[0]?.[0])).toContain("/admin/login");
		expect(result.headers["set-cookie"]).toHaveLength(2);
	});

	it("keeps admin login dispatch for case-insensitive URLs with trailing slashes", async () => {
		const api = vi.fn<typeof fetch>().mockResolvedValueOnce(credentials());
		const app = createApp({ fetch: api });
		const form = await request(app).get("/ADMIN/LOGIN/");
		expect(form.text).toContain('<h1 class="login__title">Admin log in</h1>');
		expect(form.text).toContain('action="/admin/login"');

		const result = await request(app)
			.post("/ADMIN/LOGIN/")
			.type("form")
			.send({ email: "admin@example.com", password: "correct-horse" });
		expect(result.status).toBe(303);
		expect(result.headers.location).toBe("/admin");
		expect(String(api.mock.calls[0]?.[0])).toContain("/admin/login");
	});

	it("rejects login responses missing actual tokens instead of pretending a session exists", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ status: "Success" }));
		const result = await request(createApp({ fetch: api }))
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "correct-horse" });
		expect(result.status).toBe(503);
		expect(result.headers["set-cookie"]).toBeUndefined();
		expect(result.headers.location).toBeUndefined();
	});

	it("logs out through the backend before clearing both browser credentials", async () => {
		const api = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ status: "Success" }));
		const result = await request(createApp({ fetch: api }))
			.post("/logout")
			.set(
				"Cookie",
				"refreshToken=current-refresh; accessToken=current-access",
			);
		expect(result.status).toBe(303);
		expect(result.headers.location).toBe("/login");
		expect(String(api.mock.calls[0]?.[0])).toContain("/auth/logout");
		expect(api.mock.calls[0]?.[1]?.headers).toMatchObject({
			Cookie: "refreshToken=current-refresh",
		});
		expect(result.headers["set-cookie"]).toHaveLength(2);
	});

	it("does not restore cookies when a refreshed protected response arrives after logout", async () => {
		let resolveRefresh!: (result: Response) => void;
		const refreshResponse = new Promise<Response>((resolve) => {
			resolveRefresh = resolve;
		});
		let refreshStarted!: () => void;
		const refreshRequestStarted = new Promise<void>((resolve) => {
			refreshStarted = resolve;
		});
		let resolveProfile!: (result: Response) => void;
		const profileResponse = new Promise<Response>((resolve) => {
			resolveProfile = resolve;
		});
		let profileStarted!: () => void;
		const profileRequestStarted = new Promise<void>((resolve) => {
			profileStarted = resolve;
		});
		const api = vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const path = String(input);
			if (path.endsWith("/auth/refresh")) {
				refreshStarted();
				return refreshResponse;
			}
			if (path.endsWith("/profile")) {
				profileStarted();
				return profileResponse;
			}
			return response({ status: "Success" });
		});
		const app = createApp({ fetch: api });
		const pageRequest = request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=current-refresh")
			.then((result) => result);

		await refreshRequestStarted;
		resolveRefresh(credentials());
		await profileRequestStarted;

		const logout = await request(app)
			.post("/logout")
			.set("Cookie", "refreshToken=current-refresh; accessToken=old-access");
		expect(logout.status).toBe(303);
		resolveProfile(response(profile));
		const page = await pageRequest;

		expect(page.status).toBe(200);
		expect(page.headers["set-cookie"]).toBeUndefined();
	});

	it("shares a refresh request across concurrent protected requests", async () => {
		let resolveRefresh!: (result: Response) => void;
		const refreshResponse = new Promise<Response>((resolve) => {
			resolveRefresh = resolve;
		});
		let refreshStarted!: () => void;
		const refreshRequestStarted = new Promise<void>((resolve) => {
			refreshStarted = resolve;
		});
		let resolveBothProfiles!: () => void;
		const bothProfilesStarted = new Promise<void>((resolve) => {
			resolveBothProfiles = resolve;
		});
		let profileRequests = 0;
		const api = vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const path = String(input);
			if (path.endsWith("/auth/refresh")) {
				refreshStarted();
				return refreshResponse;
			}
			if (path.endsWith("/profile")) {
				profileRequests += 1;
				if (profileRequests === 2) resolveBothProfiles();
				await bothProfilesStarted;
				return response(profile);
			}
			return response({ status: "Success" });
		});
		const app = createApp({ fetch: api });
		const firstPage = request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=shared-refresh")
			.then((result) => result);
		const secondPage = request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=shared-refresh")
			.then((result) => result);

		await refreshRequestStarted;
		resolveRefresh(credentials());
		await bothProfilesStarted;
		const [firstResult, secondResult] = await Promise.all([
			firstPage,
			secondPage,
		]);

		expect(
			api.mock.calls.filter(([input]) =>
				String(input).endsWith("/auth/refresh"),
			),
		).toHaveLength(1);
		expect(firstResult.status).toBe(200);
		expect(secondResult.status).toBe(200);
		expect(firstResult.headers["set-cookie"]).toHaveLength(2);
		expect(secondResult.headers["set-cookie"]).toHaveLength(2);
	});

	it("cleans up a shared failed refresh so a later request can retry", async () => {
		let resolveRefresh!: (result: Response) => void;
		const refreshResponse = new Promise<Response>((resolve) => {
			resolveRefresh = resolve;
		});
		let refreshStarted!: () => void;
		const refreshRequestStarted = new Promise<void>((resolve) => {
			refreshStarted = resolve;
		});
		let refreshRequests = 0;
		const api = vi.fn<typeof fetch>().mockImplementation(async (input) => {
			const path = String(input);
			if (path.endsWith("/auth/refresh")) {
				refreshRequests += 1;
				if (refreshRequests === 1) {
					refreshStarted();
					return refreshResponse;
				}
				return credentials();
			}
			return response(profile);
		});
		const app = createApp({ fetch: api });
		const firstPage = request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=retry-refresh")
			.then((result) => result);
		const secondPage = request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=retry-refresh")
			.then((result) => result);

		await refreshRequestStarted;
		await new Promise((resolve) => setTimeout(resolve, 10));
		resolveRefresh(response({ error: "Expired refresh" }, 401));
		const [firstResult, secondResult] = await Promise.all([
			firstPage,
			secondPage,
		]);
		expect(firstResult.status).toBe(303);
		expect(secondResult.status).toBe(303);
		expect(refreshRequests).toBe(1);

		const retry = await request(app)
			.get("/profile")
			.set("Cookie", "refreshToken=retry-refresh");
		expect(retry.status).toBe(200);
		expect(refreshRequests).toBe(2);
	});

	it("rejects cross-origin login and logout", async () => {
		const api = vi.fn<typeof fetch>();
		const app = createApp({ fetch: api });
		for (const path of ["/login", "/admin/login", "/logout"]) {
			const result = await request(app)
				.post(path)
				.set("Origin", "https://evil.example")
				.type("form")
				.send({});
			expect(result.status).toBe(403);
		}
		expect(api).not.toHaveBeenCalled();
	});

	it("requires an actual auth cookie, not an unrelated browser cookie", async () => {
		const api = vi.fn<typeof fetch>();
		const result = await request(createApp({ fetch: api }))
			.get("/profile")
			.set("Cookie", "tracking=value");
		expect(result.status).toBe(303);
		expect(api).not.toHaveBeenCalled();
	});
});

describe("SessionService", () => {
	const bearer = (token: string) => ["Bearer", token].join(" ");
	const token = (claims: Record<string, unknown>) =>
		`header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
	const refreshCookie =
		"refreshToken=refresh-two; Domain=backend.local; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict";
	const refreshResponse = (accessToken = "access-two") =>
		new Response(JSON.stringify({ accessToken, expiresIn: 900 }), {
			headers: { "Set-Cookie": refreshCookie },
		});
	const fakeRequest = (headers: Record<string, string> = {}) =>
		({
			get: (name: string) => headers[name.toLowerCase()],
		}) as unknown as Request;
	const fakeResponse = () => {
		const mocks = {
			set: vi.fn(),
			cookie: vi.fn(),
			append: vi.fn(),
			clearCookie: vi.fn(),
		};
		return { mocks, res: mocks as unknown as ExpressResponse };
	};
	const setup = () => {
		const fetchMock = vi.fn<typeof fetch>();
		const service = new SessionService(
			new BackendApi("http://backend:4000", fetchMock),
		);
		return { fetchMock, service };
	};
	const sent = (
		fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
		index = 0,
	) => {
		const [url, init] = fetchMock.mock.calls[index] ?? [];
		return {
			url: String(url),
			method: init?.method,
			headers: init?.headers,
			body:
				init?.body === undefined ? undefined : JSON.parse(String(init.body)),
		};
	};
	const cookieOptions = {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		path: "/",
	};

	describe("establish", () => {
		it("writes the access cookie and the refresh cookie without its domain", () => {
			const { service } = setup();
			const { mocks, res } = fakeResponse();

			service.establish(res, {
				result: { accessToken: "access-one", expiresIn: 900 },
				cookies: ["other=value; Path=/", refreshCookie],
			});

			expect(mocks.set).toHaveBeenCalledWith("Cache-Control", "no-store");
			expect(mocks.cookie).toHaveBeenCalledExactlyOnceWith(
				"accessToken",
				"access-one",
				{ ...cookieOptions, maxAge: 900_000 },
			);
			expect(mocks.append).toHaveBeenCalledExactlyOnceWith(
				"Set-Cookie",
				"refreshToken=refresh-two; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict",
			);
		});

		it.each([
			[
				"a non-string access token",
				{ accessToken: 1, expiresIn: 900 },
				[refreshCookie],
			],
			[
				"an unexpected expiry",
				{ accessToken: "a", expiresIn: 60 },
				[refreshCookie],
			],
			["no refresh cookie", { accessToken: "a", expiresIn: 900 }, ["other=x"]],
		])("rejects credentials with %s", (_label, result, cookies) => {
			const { service } = setup();
			const { mocks, res } = fakeResponse();

			expect(() =>
				service.establish(res, {
					result: result as unknown as LoginResponse,
					cookies,
				}),
			).toThrow("Backend returned incomplete session credentials");
			expect(mocks.cookie).not.toHaveBeenCalled();
		});
	});

	describe("request", () => {
		it("forwards an Authorization header with the body, method and headers", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock.mockResolvedValueOnce(response({ ok: true }));

			const result = await service.request(
				"/admin/orders/1/status",
				fakeRequest({ authorization: bearer("header-token") }),
				res,
				{ "X-Trace": "1" },
				{ status: "SHIPPED" },
				"PUT",
			);

			expect(result).toEqual({ ok: true });
			expect(sent(fetchMock)).toEqual({
				url: "http://backend:4000/admin/orders/1/status",
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"X-Trace": "1",
					Authorization: bearer("header-token"),
				},
				body: { status: "SHIPPED" },
			});
			expect(mocks.set).toHaveBeenCalledWith("Cache-Control", "no-store");
			expect(mocks.cookie).not.toHaveBeenCalled();
			expect(mocks.clearCookie).not.toHaveBeenCalled();
		});

		it("turns the access-token cookie into a bearer header", async () => {
			const { fetchMock, service } = setup();
			fetchMock.mockResolvedValueOnce(response(profile));

			await service.request(
				"/profile",
				fakeRequest({ cookie: "theme=dark; accessToken=cookie-token" }),
				fakeResponse().res,
			);

			expect(sent(fetchMock)).toMatchObject({
				method: "GET",
				headers: { Authorization: bearer("cookie-token") },
			});
		});

		it.each([
			["no cookies", {}],
			["an unrelated cookie", { cookie: "tracking=value" }],
			[
				"duplicate refresh cookies",
				{ cookie: "refreshToken=one; refreshToken=two" },
			],
			["a malformed refresh cookie", { cookie: "refreshToken=bad%20value" }],
		])("asks the user to log in when there is %s", async (_label, headers) => {
			const { fetchMock, service } = setup();

			const error = await service
				.request("/profile", fakeRequest(headers), fakeResponse().res)
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(BackendApiError);
			expect(error).toMatchObject({ status: 401, message: "Please log in." });
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("does not refresh when the access token fails for another reason", async () => {
			const { fetchMock, service } = setup();
			fetchMock.mockResolvedValueOnce(response({ error: "Boom" }, 500));

			await expect(
				service.request(
					"/profile",
					fakeRequest({ cookie: "accessToken=a; refreshToken=r" }),
					fakeResponse().res,
				),
			).rejects.toMatchObject({ status: 500, message: "Boom" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("refreshes an expired access token, retries and stores the new session", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock
				.mockResolvedValueOnce(response({ error: "Expired" }, 401))
				.mockResolvedValueOnce(refreshResponse())
				.mockResolvedValueOnce(response(profile));

			const result = await service.request(
				"/profile",
				fakeRequest({ cookie: "accessToken=old; refreshToken=refresh-one" }),
				res,
			);

			expect(result).toEqual(profile);
			expect(sent(fetchMock, 1)).toEqual({
				url: "http://backend:4000/auth/refresh",
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "refreshToken=refresh-one",
				},
				body: {},
			});
			expect(sent(fetchMock, 2)).toMatchObject({
				url: "http://backend:4000/profile",
				headers: { Authorization: bearer("access-two") },
			});
			expect(mocks.cookie).toHaveBeenCalledWith(
				"accessToken",
				"access-two",
				expect.objectContaining({ maxAge: 900_000 }),
			);
			expect(mocks.append).toHaveBeenCalledWith(
				"Set-Cookie",
				expect.stringMatching(/^refreshToken=refresh-two;/),
			);
		});

		it.each([200, 404])(
			"reuses refreshed access for sequential calls in one request after status %s",
			async (status) => {
				const { fetchMock, service } = setup();
				const { res, mocks } = fakeResponse();
				const req = fakeRequest({
					cookie: "accessToken=old; refreshToken=refresh-one",
				});
				fetchMock
					.mockResolvedValueOnce(response({ error: "Expired" }, 401))
					.mockResolvedValueOnce(refreshResponse())
					.mockResolvedValueOnce(
						response(status === 200 ? profile : { error: "Not found" }, status),
					)
					.mockResolvedValueOnce(response({ ok: true }));

				const first = service.request("/profile", req, res);
				if (status === 200) {
					await expect(first).resolves.toEqual(profile);
				} else {
					await expect(first).rejects.toMatchObject({ status });
				}
				await expect(
					service.request("/orders/from-reservation", req, res, {}, {}, "POST"),
				).resolves.toEqual({ ok: true });

				expect(fetchMock).toHaveBeenCalledTimes(4);
				expect(sent(fetchMock, 3)).toMatchObject({
					headers: { Authorization: bearer("access-two") },
					method: "POST",
				});
				expect(mocks.cookie).toHaveBeenCalledTimes(1);
			},
		);

		it("shares one refresh between concurrent requests with the same token", async () => {
			const { fetchMock, service } = setup();
			fetchMock.mockImplementation(async (url) =>
				String(url).endsWith("/auth/refresh")
					? refreshResponse()
					: response(profile),
			);
			const req = fakeRequest({ cookie: "refreshToken=shared" });

			await Promise.all([
				service.request("/profile", req, fakeResponse().res),
				service.request("/profile", req, fakeResponse().res),
			]);

			const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
				String(url).endsWith("/auth/refresh"),
			);
			expect(refreshCalls).toHaveLength(1);
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});

		it("reports an expired session when the refresh token is rejected", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock.mockResolvedValueOnce(response({ error: "Invalid" }, 401));

			const error = await service
				.request("/profile", fakeRequest({ cookie: "refreshToken=r" }), res)
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(SessionExpiredError);
			expect(error).toMatchObject({
				status: 401,
				message: "Your session has expired.",
			});
			expect(mocks.clearCookie).toHaveBeenCalledWith(
				"accessToken",
				cookieOptions,
			);
			expect(mocks.clearCookie).toHaveBeenCalledWith(
				"refreshToken",
				cookieOptions,
			);
		});

		it("propagates non-401 refresh failures without clearing cookies", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

			await expect(
				service.request(
					"/profile",
					fakeRequest({ cookie: "refreshToken=r" }),
					res,
				),
			).rejects.toThrow("fetch failed");
			expect(mocks.clearCookie).not.toHaveBeenCalled();
		});

		it("clears the session when the retried request is still unauthorised", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock
				.mockResolvedValueOnce(refreshResponse())
				.mockResolvedValueOnce(response({ error: "Nope" }, 401));

			await expect(
				service.request(
					"/profile",
					fakeRequest({ cookie: "refreshToken=r" }),
					res,
				),
			).rejects.toMatchObject({ status: 401, message: "Nope" });
			expect(mocks.clearCookie).toHaveBeenCalledTimes(2);
			expect(mocks.cookie).not.toHaveBeenCalled();
		});

		it("keeps the refreshed session when the retried request fails otherwise", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock
				.mockResolvedValueOnce(refreshResponse())
				.mockResolvedValueOnce(response({ error: "Missing" }, 404));

			await expect(
				service.request(
					"/profile",
					fakeRequest({ cookie: "refreshToken=r" }),
					res,
				),
			).rejects.toMatchObject({ status: 404 });
			expect(mocks.cookie).toHaveBeenCalledWith(
				"accessToken",
				"access-two",
				expect.anything(),
			);
			expect(mocks.clearCookie).not.toHaveBeenCalled();
		});

		it("rejects refreshed customer sessions on staff resources", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock
				.mockResolvedValueOnce(refreshResponse(token({ kind: "customer" })))
				.mockResolvedValueOnce(response({ error: "Forbidden" }, 403));

			const error = await service
				.request("/admin", fakeRequest({ cookie: "refreshToken=r" }), res)
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(CustomerSessionError);
			expect(error).toMatchObject({ status: 403 });
			expect(mocks.cookie).toHaveBeenCalledTimes(1);
		});

		it("passes through 403s for refreshed staff sessions", async () => {
			const { fetchMock, service } = setup();
			fetchMock
				.mockResolvedValueOnce(refreshResponse(token({ kind: "staff" })))
				.mockResolvedValueOnce(response({ error: "Forbidden" }, 403));

			const error = await service
				.request(
					"/admin/users",
					fakeRequest({ cookie: "refreshToken=r" }),
					fakeResponse().res,
				)
				.catch((caught: unknown) => caught);

			expect(error).not.toBeInstanceOf(CustomerSessionError);
			expect(error).toMatchObject({ status: 403, message: "Forbidden" });
		});
	});

	describe("accessTokenKind", () => {
		it("reads the kind claim from a bearer header", () => {
			const { service } = setup();

			expect(
				service.accessTokenKind(
					fakeRequest({ authorization: bearer(token({ kind: "staff" })) }),
				),
			).toBe("staff");
		});

		it("falls back to the access-token cookie", () => {
			const { service } = setup();

			expect(
				service.accessTokenKind(
					fakeRequest({
						authorization: "Basic abc",
						cookie: `accessToken=${token({ kind: "customer" })}`,
					}),
				),
			).toBe("customer");
		});

		it.each([
			["no token", {}],
			["a token without a payload", { authorization: bearer("opaque") }],
			["a non-JSON payload", { authorization: bearer("a.bm90LWpzb24.c") }],
			["a missing kind claim", { authorization: bearer(token({ sub: 1 })) }],
			["a non-string kind", { authorization: bearer(token({ kind: 1 })) }],
		])("returns undefined for %s", (_label, headers) => {
			expect(setup().service.accessTokenKind(fakeRequest(headers))).toBe(
				undefined,
			);
		});
	});

	describe("logout", () => {
		it("revokes the refresh token and clears both cookies", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock.mockResolvedValueOnce(response({ ok: true }));

			await service.logout(fakeRequest({ cookie: "refreshToken=r1" }), res);

			expect(sent(fetchMock)).toEqual({
				url: "http://backend:4000/auth/logout",
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "refreshToken=r1",
				},
				body: {},
			});
			expect(mocks.clearCookie).toHaveBeenCalledWith(
				"accessToken",
				cookieOptions,
			);
			expect(mocks.clearCookie).toHaveBeenCalledWith(
				"refreshToken",
				cookieOptions,
			);
		});

		it("still calls the backend without a refresh cookie", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			fetchMock.mockResolvedValueOnce(response({ ok: true }));

			await service.logout(fakeRequest(), res);

			expect(sent(fetchMock).headers).toEqual({
				"Content-Type": "application/json",
			});
			expect(mocks.clearCookie).toHaveBeenCalledTimes(2);
		});

		it("does not let an in-flight refresh re-establish a logged-out session", async () => {
			const { fetchMock, service } = setup();
			const { mocks, res } = fakeResponse();
			let resolveRefresh: (value: Response) => void = () => {};
			fetchMock.mockImplementation((url) => {
				const path = new URL(String(url)).pathname;
				if (path === "/auth/refresh")
					return new Promise<Response>((resolve) => {
						resolveRefresh = resolve;
					});
				return Promise.resolve(response(path === "/profile" ? profile : {}));
			});
			const req = fakeRequest({ cookie: "refreshToken=r1" });

			const pending = service.request("/profile", req, res);
			await service.logout(req, fakeResponse().res);
			resolveRefresh(refreshResponse());

			await expect(pending).resolves.toEqual(profile);
			expect(mocks.cookie).not.toHaveBeenCalled();
		});

		it("propagates backend failures", async () => {
			const { fetchMock, service } = setup();
			fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

			await expect(
				service.logout(fakeRequest(), fakeResponse().res),
			).rejects.toThrow("fetch failed");
		});
	});
});
