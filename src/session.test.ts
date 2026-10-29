import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

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

	it("does not retry forbidden requests or loop when a replacement access token is rejected", async () => {
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
		expect(api).toHaveBeenCalledTimes(1);

		const rejected = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(credentials())
			.mockResolvedValueOnce(response({ error: "Unauthorized" }, 401));
		const retry = await request(createApp({ fetch: rejected }))
			.get("/admin")
			.set("Cookie", "refreshToken=current");
		expect(retry.status).toBe(401);
		expect(rejected).toHaveBeenCalledTimes(2);
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
