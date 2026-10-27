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

	it("loads admin dashboard data with a browser session cookie", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [],
			quickActions: [],
			cards: [],
			recentOrders: [],
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
			.set("Cookie", "session=staff-session");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Staff member");
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Cookie: "session=staff-session",
		});
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
			.set("Cookie", "session=customer-session");

		expect(res.status).toBe(403);
		expect(res.text).not.toContain("New registrations");
	});

	it("loads basket data and forwards browser credentials to the backend", async () => {
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
		)
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "))
			.set("Cookie", "session=customer-session");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("£3.50 each");
		expect(res.text).toContain("£7.00");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "test-token"].join(" "),
			Cookie: "session=customer-session",
		});
	});

	it("requires authentication before loading a basket", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/basket");

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to view your basket.");
		expect(res.text).toContain('href="/login"');
		expect(res.text).toMatch(/id="basket-empty"[^>]*hidden/);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("establishes a browser session at login and uses it to load the basket", async () => {
		const basket = {
			items: [
				{
					id: 1,
					productName: "Green tea",
					quantity: 1,
					unitPrice: 3.5,
				},
			],
			subtotal: 3.5,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: "ok" }), {
					headers: {
						"Set-Cookie":
							"session=customer-session; Domain=backend.local; Path=/; HttpOnly; SameSite=Strict",
					},
				}),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify(basket)));
		const client = request.agent(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		);

		const login = await client
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "correct-horse" });
		const basketResponse = await client.get("/basket");

		expect(login.status).toBe(303);
		expect(login.headers["set-cookie"]).toEqual([
			"session=customer-session; Path=/; HttpOnly; SameSite=Lax",
		]);
		expect(basketResponse.status).toBe(200);
		expect(basketResponse.text).toContain("Green tea");
		expect(fetchApi.mock.calls[1]?.[1]?.headers).toMatchObject({
			Cookie: "session=customer-session",
		});
	});

	it("handles rejected basket credentials as unauthenticated", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to view your basket.");
		expect(res.text).not.toContain("temporarily unavailable");
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

	it("loads Product-table data for the payment gateway", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						prod_id: 7,
						name: "Green tea",
						category: "Food & Drink",
						description: "Fresh tea",
						price: 1299,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/payment_gateway");

		expect(res.status).toBe(200);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products",
		);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('name="productId" value="7"');
	});

	it("shows a clear unavailable response when the product service is offline", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/payment_gateway",
		);

		expect(res.status).toBe(503);
		expect(res.text).toContain("Products are temporarily unavailable.");
		expect(res.text).not.toContain("Connection refused");
	});

	it("simulates a payment using product-table prices, not submitted prices", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						prod_id: 7,
						name: "Green tea",
						category: "Food & Drink",
						description: "Fresh tea",
						price: 1299,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "2", price: "0.01" });

		expect(res.status).toBe(200);
		expect(res.text).toContain(
			"Mock payment successful. No real payment was processed.",
		);
		expect(res.text).toContain("£25.98");
		expect(res.text).toContain("Green tea × 2");
		expect(fetchApi).toHaveBeenCalledTimes(1);
	});

	it("simulates multiple selected products and totals their quantities", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						prod_id: 7,
						name: "Green tea",
						category: "Food & Drink",
						description: "Fresh tea",
						price: 1299,
						imageURL: "",
					},
					{
						prod_id: 8,
						name: "Coffee",
						category: "Food & Drink",
						description: "Roasted beans",
						price: 500,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: ["7", "8"], quantity: ["2", "1"] });

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea × 2");
		expect(res.text).toContain("Coffee × 1");
		expect(res.text).toContain("£30.98");
		expect(res.text).toContain(">3</span>");
	});

	it("rejects payment requests with no selected products", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify([])));
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "0" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("Select at least one product");
	});

	it("rejects product IDs that are not in the products table", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify([])));
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "1" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("Selected product is no longer available.");
		expect(res.text).toContain("Choose your products");
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
		expect(res.text).toContain('href="/products/1"');
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).not.toContain("Coffee");
		expect(res.text).toContain("Food%20%26%20Drink");
	});

	it("loads an expanded product by prodId", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					prod_id: 42,
					name: "Green tea",
					category: "Food & Drink",
					description: "Fresh tea",
					price: 1299,
					imageURL: "https://example.com/tea.jpg",
				}),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/products/42");

		expect(res.status).toBe(200);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products/42",
		);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("Fresh tea");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).toContain('name="productId" value="42"');
		expect(res.text).toContain('href="/styles.css"');
	});

	it.each(["abc", "0", "-1", "1.5", "9007199254740992"])(
		"rejects invalid product ID %s without calling the backend",
		async (prodId) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi })).get(
				`/products/${prodId}`,
			);

			expect(res.status).toBe(400);
			expect(res.text).toContain("Invalid product ID.");
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it("renders the not-found page for a missing product", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
			);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42",
		);

		expect(res.status).toBe(404);
		expect(res.text).toContain("Product not found");
	});

	it("shows an unavailable message when the product backend fails", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42",
		);

		expect(res.status).toBe(503);
		expect(res.text).toContain("Product is temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
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
			? await (path === "/admin" || path === "/basket"
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
