import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { loginResponse } from "./testHelpers";

const app = createApp();

describe("auth", () => {
	it.each([
		["/login", "Log in"],
		["/register", "Create your account"],
		["/forgot-password", "Forgot your password?"],
	])("GET %s renders the page", async (path, heading) => {
		expect(readdirSync("src/pages")).toContain(`${path.slice(1)}.njk`);

		const res = await request(app).get(path);

		expect(res.status).toBe(200);
		expect(res.text).toContain(heading);
	});

	it("shows registration confirmation on the login page", async () => {
		const res = await request(app).get("/login?registered=1");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Account created. You can now log in.");
	});

	it("places the forgotten-password prompt below the sign-up prompt", async () => {
		const res = await request(app).get("/login");
		expect(res.text).toContain('href="/forgot-password"');
		expect(res.text.indexOf("Forgot your password?")).toBeGreaterThan(
			res.text.indexOf("Don't have an account?"),
		);
	});

	it("renders reset forms without caching or leaking referrers", async () => {
		const token = "a".repeat(64);
		const res = await request(app).get(`/reset-password?token=${token}`);
		expect(readdirSync("src/pages")).toContain("reset-password.njk");
		expect(res.status).toBe(200);
		expect(res.headers["cache-control"]).toBe("no-store");
		expect(res.headers["referrer-policy"]).toBe("no-referrer");
		expect(res.text).toContain(`name="token" value="${token}"`);
		expect(res.text).toContain('autocomplete="new-password"');
	});

	it.each(["", "?token=invalid", "?token=x&token=y"])(
		"rejects a missing or malformed reset token %s",
		async (query) => {
			const res = await request(app).get(`/reset-password${query}`);
			expect(res.status).toBe(400);
			expect(res.text).toContain("This reset link is invalid.");
			expect(res.text).not.toContain("<form");
			expect(res.text).toContain('href="/forgot-password"');
		},
	);

	it("shows generic reset-request confirmation and password-reset success", async () => {
		const sent = await request(app).get("/forgot-password?sent=1");
		expect(sent.text).toContain("If an account exists for that email");
		expect(sent.text).not.toContain("<form");
		const reset = await request(app).get("/login?reset=1");
		expect(reset.text).toContain(
			"Password reset. You can now log in with your new password.",
		);
	});

	it.each([
		[
			"login",
			{ email: "ada@example.com", password: "correct-horse" },
			"/products",
		],
		[
			"forgot-password",
			{ email: "ada@example.com" },
			"/forgot-password?sent=1",
		],
		[
			"reset-password",
			{
				token: "a".repeat(64),
				password: "new-password",
				confirmPassword: "new-password",
			},
			"/login?reset=1",
		],
		[
			"register",
			{
				forename: "Ada",
				surname: "Lovelace",
				email: "ada@example.com",
				password: "correct-horse",
				confirmPassword: "correct-horse",
			},
			"/login?registered=1",
		],
	])(
		"POST /%s forwards JSON to the backend and redirects",
		async (page, values, location) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					page === "login"
						? loginResponse()
						: new Response(JSON.stringify({ status: "ok" })),
				);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.post(`/${page}`)
				.type("form")
				.send(values);
			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			const [url, options] = fetchApi.mock.calls[0] ?? [];
			expect(String(url)).toBe(`http://backend:4000/${page}`);
			expect(options?.method).toBe("POST");
			const { confirmPassword: _confirmation, ...payload } = values as Record<
				string,
				string
			>;
			expect(JSON.parse(options?.body as string)).toEqual(payload);
		},
	);

	it("does not call the backend when confirmation differs", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/register")
			.type("form")
			.send({
				email: "ada@example.com",
				password: "correct-horse",
				confirmPassword: "different-password",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Passwords do not match.");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("rate-limits repeated authentication submissions", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid email or password" }), {
				status: 401,
			}),
		);
		const client = request(createApp({ fetch: fetchApi }));

		for (let attempt = 0; attempt < 10; attempt++) {
			const res = await client
				.post("/login")
				.type("form")
				.send({ email: "ada@example.com", password: "wrong-password" });
			expect(res.status).toBe(401);
		}

		const limited = await client
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "wrong-password" });

		expect(limited.status).toBe(429);
		expect(fetchApi).toHaveBeenCalledTimes(10);
	});

	it("lets RATE_LIMIT_MAX raise the login limit outside production only", async () => {
		vi.stubEnv("RATE_LIMIT_MAX", "25");
		try {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(JSON.stringify({ error: "Invalid email or password" }), {
					status: 401,
				}),
			);
			const login = (app: ReturnType<typeof createApp>) =>
				request(app)
					.post("/login")
					.type("form")
					.send({ email: "ada@example.com", password: "wrong-password" });

			vi.stubEnv("NODE_ENV", "development");
			const raised = await login(createApp({ fetch: fetchApi }));
			expect(raised.headers.ratelimit).toMatch(/^"25-in-/);

			vi.stubEnv("NODE_ENV", "production");
			const unchanged = await login(createApp({ fetch: fetchApi }));
			expect(unchanged.headers.ratelimit).toMatch(/^"10-in-/);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("keeps a failed login on the form", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid email or password" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/login")
			.type("form")
			.send({
				email: "ada@example.com",
				password: "wrong-password",
			});
		expect(res.status).toBe(401);
		expect(res.text).toContain("Invalid email or password");
		expect(res.text).toContain('value="ada@example.com"');
		expect(res.headers.location).toBeUndefined();
		expect(res.text).not.toContain("wrong-password");
	});

	it("keeps the token but never passwords after a reset confirmation mismatch", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const token = "a".repeat(64);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/reset-password")
			.type("form")
			.send({
				token,
				password: "private-password",
				confirmPassword: "different",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Passwords do not match.");
		expect(res.text).toContain(`value="${token}"`);
		expect(res.text).not.toContain("private-password");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it.each([
		["/forgot-password", "Invalid email address"],
		["/reset-password", "This reset link is invalid or has expired."],
	])(
		"shows backend rejection for %s without redirecting",
		async (path, error) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					new Response(JSON.stringify({ error }), { status: 400 }),
				);

			const res = await request(createApp({ fetch: fetchApi }))
				.post(path)
				.type("form")
				.send({
					email: "ada@example.com",
					token: "a".repeat(64),
					password: "private-password",
					confirmPassword: "private-password",
				});
			expect(res.status).toBe(400);
			expect(res.text).toContain(error);
			expect(res.text).not.toContain("private-password");
			expect(res.headers.location).toBeUndefined();
		},
	);

	it("shows reset rate-limit errors instead of a service outage", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: "Too many password reset attempts. Please try again later.",
				}),
				{ status: 429 },
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/forgot-password")
			.type("form")
			.send({ email: "ada@example.com" });
		expect(res.status).toBe(429);
		expect(res.text).toContain("Too many password reset attempts.");
		expect(res.text).not.toContain("temporarily unavailable");
	});

	it("shows backend field validation without exposing the password", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: "Invalid registration details",
					details: { password: ["Too short"] },
				}),
				{ status: 400 },
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/register")
			.type("form")
			.send({
				forename: "<script>alert(1)</script>",
				email: "ada@example.com",
				password: "secret",
				confirmPassword: "secret",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Too short");
		expect(res.text).not.toContain('value="secret"');
		expect(res.text).not.toContain("<script>");
	});
});
