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
					productId: 1,
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
					productId: 1,
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
				productId: 7,
				name: "Green tea",
				category: "Food & Drink",
				description: "Fresh tea",
				price: 12.99,
				imageURL: "https://example.com/tea.jpg",
			},
			{
				productId: 2,
				name: "Coffee",
				category: "Other",
				description: "Roasted beans",
				price: 5,
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
		expect(res.text).toContain('href="/products/7"');
		expect(res.text).not.toContain('href="/products/"');
		expect(res.text).not.toContain("undefined");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).not.toContain("Coffee");
		expect(res.text).toContain("Food%20%26%20Drink");
	});

	it("displays backend prices in pounds without dividing by 100", async () => {
		const products = [
			{
				productId: 1,
				name: "CoreBook 14 Essential",
				category: "Laptops",
				description: "Laptop",
				price: 349.99,
				imageURL: "",
			},
			{
				productId: 2,
				name: "Big monitor",
				category: "Monitors",
				description: "Monitor",
				price: 1249,
				imageURL: "",
			},
		];
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(products)));
		const res = await request(createApp({ fetch: fetchApi })).get("/products");

		expect(res.text).toContain("£349.99");
		expect(res.text).toContain("£1,249.00");
		expect(res.text).not.toContain("£3.50");
	});

	it("shows a short description preview on catalogue cards", async () => {
		const description = `${"Long words ".repeat(30)}END-OF-DESCRIPTION`;
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						productId: 3,
						name: "Wordy",
						category: "Other",
						description,
						price: 1,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get("/products");
		const preview = res.text.match(
			/class="product-card__description"[^>]*>([^<]*)</,
		)?.[1];

		expect(preview).toBeDefined();
		expect(preview?.length).toBeLessThanOrEqual(111);
		expect(preview?.endsWith("…")).toBe(true);
		expect(preview).not.toContain("END-OF-DESCRIPTION");
		expect(res.text).toContain('href="/products/3"');
	});

	it("loads an expanded product by productId", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 42,
					name: "Green tea",
					category: "Food & Drink",
					description: "Fresh tea",
					price: 12.99,
					imageURL: "https://example.com/tea.jpg",
					inventory: { quantity: 30 },
				}),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/products/42");

		expect(res.status).toBe(200);
		expect(fetchApi).toHaveBeenCalledTimes(1);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products/42",
		);
		expect(res.headers["content-type"]).toContain("text/html");
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("Fresh tea");
		expect(res.text).toContain("Food &amp; Drink");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).toContain('action="/basket" method="post"');
		expect(res.text).toContain('name="productId" value="42"');
		expect(res.text).toMatch(/name="quantity"[^>]*max="30"/);
		expect(res.text).toContain("In stock");
		expect(res.text).not.toMatch(/<button[^>]*disabled/);
		expect(res.text).toContain('href="/styles.css"');
	});

	it.each([
		[{ quantity: 0 }, "Out of stock", true, 'max="1"'],
		[null, "Out of stock", true, 'max="1"'],
		[{ quantity: 3 }, "Only 3 left in stock", false, 'max="3"'],
		[{ quantity: 500 }, "In stock", false, 'max="99"'],
	])(
		"renders stock state for inventory %j",
		async (inventory, message, disabled, max) => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(
					JSON.stringify({
						productId: 5,
						name: "Mouse",
						category: "Mice",
						description: "Clicky",
						price: 19.99,
						imageURL: "",
						inventory,
					}),
				),
			);
			const res = await request(createApp({ fetch: fetchApi })).get(
				"/products/5",
			);

			expect(res.status).toBe(200);
			expect(res.text).toContain(message);
			expect(res.text).toContain(max);
			expect(/<button[^>]*disabled/.test(res.text)).toBe(disabled);
			expect(/name="quantity"[^>]*disabled/.test(res.text)).toBe(disabled);
		},
	);

	it("uses a collapsible full description on the product page", async () => {
		const description = `${"Detail ".repeat(40)}END`;
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 9,
					name: "Laptop",
					category: "Laptops",
					description,
					price: 1,
					imageURL: "",
					inventory: { quantity: 1 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/9",
		);

		expect(res.text).toContain('<details class="product-detail__description">');
		expect(res.text).toContain("Read full description");
		expect(res.text).toContain(description);
	});

	it("does not display a different product than the one requested", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 1,
					name: "Wrong product",
					category: "Other",
					description: "Nope",
					price: 1,
					imageURL: "",
					inventory: { quantity: 1 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/2",
		);

		expect(res.status).toBe(503);
		expect(res.text).not.toContain("Wrong product");
	});

	it("adds a product to the basket and relays the basket cookie", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ items: [], subtotal: 0 }), {
				headers: {
					"Set-Cookie":
						"basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
				},
			}),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/basket")
			.set("Cookie", "session=abc")
			.type("form")
			.send({ productId: "42", quantity: "3" });

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/basket");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		const init = fetchApi.mock.calls[0]?.[1];
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			productId: 42,
			quantity: 3,
		});
		expect(init?.headers).toMatchObject({ Cookie: "session=abc" });
		expect(res.headers["set-cookie"]).toEqual([
			"basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax",
		]);
	});

	it.each([
		[{ productId: "42", quantity: "0" }, "/products/42?basket=invalid"],
		[{ productId: "42", quantity: "100" }, "/products/42?basket=invalid"],
		[{ productId: "42", quantity: "1.5" }, "/products/42?basket=invalid"],
		[{ productId: "abc", quantity: "1" }, "/products"],
	])(
		"rejects invalid add-to-basket input %j without calling the backend",
		async (form, location) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/basket")
				.type("form")
				.send(form);

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it.each([
		[404, "Product not found", "notfound"],
		[400, "Quantity cannot exceed 99", "limit"],
		[500, "Internal server error", "unavailable"],
	])(
		"returns to the product page when the backend responds %i",
		async (status, error, code) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response(JSON.stringify({ error }), { status }));
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/basket")
				.type("form")
				.send({ productId: "42", quantity: "1" });

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(`/products/42?basket=${code}`);
		},
	);

	it("shows add-to-basket errors on the product page", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 42,
					name: "Green tea",
					category: "Food & Drink",
					description: "Fresh tea",
					price: 12.99,
					imageURL: "",
					inventory: { quantity: 30 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42?basket=limit",
		);

		expect(res.text).toContain(
			"Your basket already holds the maximum quantity of this product.",
		);
	});

	it.each(["abc", "0", "-1", "1.5", "9007199254740992"])(
		"rejects invalid product ID %s without calling the backend",
		async (productId) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi })).get(
				`/products/${productId}`,
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
