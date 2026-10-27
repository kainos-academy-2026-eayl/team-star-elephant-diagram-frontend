import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const app = createApp();

describe("app", () => {
	it("GET /health returns ok", async () => {
		const res = await request(app).get("/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
	});

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

	it("loads admin dashboard data from the backend", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [{ label: "Orders" }],
			quickActions: [{ label: "Add product" }],
			cards: [{ label: "Orders today", value: "4" }],
			recentOrders: [
				{ id: 42, customer: "Ada Lovelace", date: "2026-10-27", status: "New" },
			],
			newUsers: [],
			stockChanges: [],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(dashboard)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/admin")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(200);
		expect(res.text).toContain("Orders today");
		expect(res.text).toContain(">4</p>");
		expect(res.text).toContain("Ada Lovelace");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/admin",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "test-token"].join(" "),
		});
	});

	it("requires staff credentials before requesting the admin dashboard", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/admin");

		expect(res.status).toBe(401);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("does not render admin data when the backend rejects staff credentials", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/admin")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(403);
		expect(res.text).not.toContain("New registrations");
	});

	it("loads basket data from the backend", async () => {
		const basket = {
			items: [
				{
					id: 1,
					productName: "Green tea",
					quantity: 2,
					unitPrice: 3.5,
					imageURL: "https://example.com/tea.jpg",
				},
			],
			subtotal: 7,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(basket)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/basket");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("£3.50 each");
		expect(res.text).toContain("£7.00");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
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

	it("does not serve the removed legacy catalogue path", async () => {
		const res = await request(app).get("/product_catalogue");

		expect(res.status).toBe(404);
	});

	it("serves the stylesheet", async () => {
		const res = await request(app).get("/styles.css");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("text/css");
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
				.mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
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

	it("loads products from the backend", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response("[]"));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/products");
		expect(res.status).toBe(200);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products",
		);
		expect(res.text).toContain("No products found.");
	});

	it("loads profile details and order history from the backend", async () => {
		const profile = {
			user: {
				firstName: "Ada",
				lastName: "Lovelace",
				email: "ada@example.com",
				memberSince: "2026-01-01",
			},
			orders: [
				{
					id: 42,
					placedAt: "2026-10-01",
					status: "Dispatched",
					items: [
						{
							productName: "Green tea",
							quantity: 2,
							displayUnitPrice: "£3.50",
							displaySubtotal: "£7.00",
						},
					],
					displayTotal: "£7.00",
				},
			],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(profile)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/profile");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Ada Lovelace");
		expect(res.text).toContain("ada@example.com");
		expect(res.text).toContain("Order #42");
		expect(res.text).toContain("Green tea");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/profile",
		);
	});

	it("shows a friendly message when profile data is unavailable", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi })).get("/profile");

		expect(res.status).toBe(503);
		expect(res.text).toContain("Your profile is temporarily unavailable.");
		expect(res.text).not.toContain("You haven't placed any orders yet.");
		expect(res.text).not.toContain("Connection refused");
	});

	it("renders real products and filters search and category", async () => {
		const products = [
			{
				prod_id: 1,
				name: "Green tea",
				category: "Food & Drink",
				description: "Fresh tea",
				price: 1299,
				imageURL: "https://example.com/tea.jpg",
			},
			{
				prod_id: 2,
				name: "Coffee",
				category: "Other",
				description: "Roasted beans",
				price: 500,
				imageURL: "",
			},
		];
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => new Response(JSON.stringify(products)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/products")
			.query({ q: "tea", category: "Food & Drink" });
		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).not.toContain("Coffee");
		expect(res.text).toContain("Food%20%26%20Drink");
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

	it.each([
		"/login",
		"/register",
		"/forgot-password",
		"/reset-password",
		"/products",
		"/admin",
		"/basket",
	])("handles an unavailable backend for %s", async (path) => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const client = request(createApp({ fetch: fetchApi }));
		const res = ["/products", "/admin", "/basket"].includes(path)
			? await (path === "/admin"
					? client
							.get(path)
							.set("Authorization", ["Bearer", "test-token"].join(" "))
					: client.get(path))
			: await client.post(path).type("form").send({
					password: "correct-horse",
					confirmPassword: "correct-horse",
				});
		expect(res.status).toBe(503);
		expect(res.text).toContain("temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
	});
});
