import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { loginResponse } from "../testHelpers";

describe("basket", () => {
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
		});
	});

	it("shows same-site product images in the basket but drops unsafe ones", async () => {
		const basket = {
			items: [
				["/images/TeamB-tshirt-front.png", 1],
				["//evil.example/x.png", 2],
				["javascript:alert(1)", 3],
			].map(([imageURL, productId]) => ({
				productId,
				productName: `Product ${productId}`,
				quantity: 1,
				unitPrice: 1,
				imageURL,
			})),
			subtotal: 3,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(basket)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(200);
		expect(res.text).toContain('src="/images/TeamB-tshirt-front.png"');
		expect(res.text).not.toContain("evil.example");
		expect(res.text).not.toContain("javascript:");
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
			.mockResolvedValueOnce(loginResponse())
			.mockResolvedValueOnce(new Response(JSON.stringify(basket)));
		const client = request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		);

		const login = await client
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "correct-horse" });
		const basketResponse = await client
			.get("/basket")
			.set("Cookie", "accessToken=access-one; refreshToken=refresh-one");

		expect(login.status).toBe(303);
		expect(login.headers["set-cookie"]).toHaveLength(2);
		for (const cookie of login.headers["set-cookie"] ?? []) {
			expect(cookie).toContain("HttpOnly");
			expect(cookie).toContain("Secure");
			expect(cookie).toContain("SameSite=Strict");
		}
		expect(basketResponse.status).toBe(200);
		expect(basketResponse.text).toContain("Green tea");
		expect(fetchApi.mock.calls[1]?.[1]?.headers).toMatchObject({
			Authorization: "Bearer access-one",
		});
	});

	it("forwards only the basket cookie when loading an authenticated customer's basket", async () => {
		const basketId = "8e0dcfff-1528-4ec6-9820-b8c9a6732000";
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ items: [], subtotal: 0 })),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/basket")
			.set(
				"Cookie",
				`accessToken=access-one; refreshToken=refresh-one; basketId=${basketId}`,
			);

		expect(res.status).toBe(200);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: `basketId=${basketId}`,
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
			.set(
				"Cookie",
				"session=abc; accessToken=access-one; basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11",
			)
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
		expect(init?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: "basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11",
		});
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
				.set("Cookie", "accessToken=access-one")
				.type("form")
				.send(form);

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it("sends logged-out users to login instead of adding to the basket", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/basket")
			.set("Cookie", "basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11")
			.type("form")
			.send({ productId: "42", quantity: "1" });

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/login");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("sends users to login when the backend rejects their session", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Authentication required" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/basket")
			.set("Cookie", "accessToken=expired")
			.type("form")
			.send({ productId: "42", quantity: "1" });

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/login");
	});

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
				.set("Cookie", "accessToken=access-one")
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

	it("updates a basket item quantity through the backend", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ items: [], subtotal: 0 })),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/basket/items/42")
			.set(
				"Cookie",
				"accessToken=access-one; basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11",
			)
			.type("form")
			.send({ quantity: "5" });

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/basket");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket/items/42",
		);
		const init = fetchApi.mock.calls[0]?.[1];
		expect(init?.method).toBe("PATCH");
		expect(JSON.parse(String(init?.body))).toEqual({ quantity: 5 });
		expect(init?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: "basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11",
		});
	});

	it("removes a basket item through the backend", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ items: [], subtotal: 0 })),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/basket/items/42/remove")
			.set("Cookie", "accessToken=access-one");

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/basket");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket/items/42",
		);
		const init = fetchApi.mock.calls[0]?.[1];
		expect(init?.method).toBe("DELETE");
		expect(init?.body).toBeUndefined();
	});

	it.each([
		["/basket/items/42", { quantity: "0" }, "/basket?basket=invalid"],
		["/basket/items/42", { quantity: "100" }, "/basket?basket=invalid"],
		["/basket/items/42", { quantity: "1.5" }, "/basket?basket=invalid"],
		["/basket/items/42", {}, "/basket?basket=invalid"],
		["/basket/items/abc", { quantity: "1" }, "/basket?basket=notfound"],
		["/basket/items/abc/remove", {}, "/basket?basket=notfound"],
	])(
		"rejects invalid basket change %s %j without calling the backend",
		async (path, form, location) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.post(path)
				.set("Cookie", "accessToken=access-one")
				.type("form")
				.send(form);

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it.each(["/basket/items/42", "/basket/items/42/remove"])(
		"sends logged-out users to login when changing the basket via %s",
		async (path) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.post(path)
				.type("form")
				.send({ quantity: "1" });

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe("/login");
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it.each([
		[401, "/login"],
		[404, "/basket?basket=notfound"],
		[400, "/basket?basket=invalid"],
		[500, "/basket?basket=unavailable"],
	])(
		"handles a %i backend response when removing a basket item",
		async (status, location) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					new Response(JSON.stringify({ error: "Failed" }), { status }),
				);
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/basket/items/42/remove")
				.set("Cookie", "accessToken=access-one");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
		},
	);

	it("renders quantity and remove controls with basket status messages", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						items: [
							{
								productId: 42,
								productName: "Green tea",
								quantity: 3,
								unitPrice: 2.5,
								imageURL: "",
							},
						],
						subtotal: 7.5,
					}),
				),
		);
		const app = createApp({ fetch: fetchApi });

		const updated = await request(app)
			.get("/basket?basket=updated")
			.set("Cookie", "accessToken=access-one");
		expect(updated.status).toBe(200);
		expect(updated.text).toContain('action="/basket/items/42"');
		expect(updated.text).toContain('name="quantity"');
		expect(updated.text).toContain('value="3"');
		expect(updated.text).toContain('action="/basket/items/42/remove"');
		expect(updated.text).toMatch(/id="basket-error"[^>]*hidden/);
		expect(updated.text).toContain('<script src="/basket.js" defer></script>');
		expect(updated.text).toMatch(
			/<noscript><button[^>]*>Update<\/button><\/noscript>/,
		);

		const script = await request(app).get("/basket.js");
		expect(script.status).toBe(200);
		expect(script.text).toContain("requestSubmit");

		const failed = await request(app)
			.get("/basket?basket=constructor")
			.set("Cookie", "accessToken=access-one");
		expect(failed.status).toBe(200);
		expect(failed.text).toMatch(/id="basket-error"[^>]*hidden/);

		const invalid = await request(app)
			.get("/basket?basket=invalid")
			.set("Cookie", "accessToken=access-one");
		expect(invalid.text).toContain("Please enter a quantity between 1 and 99.");
	});

	it("handles an unavailable backend for /basket", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "));
		expect(res.status).toBe(503);
		expect(res.text).toContain("temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
	});
});
