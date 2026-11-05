import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

describe("products", () => {
	it("does not serve the removed legacy catalogue path", async () => {
		const res = await request(createApp()).get("/product_catalogue");

		expect(res.status).toBe(404);
	});

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

	it("allows same-site image paths but drops unsafe image URLs", async () => {
		const products = [
			["/images/TeamB-tshirt-front.png", 1],
			["//evil.example/x.png", 2],
			["/\\evil.example/x.png", 3],
			["javascript:alert(1)", 4],
		].map(([imageURL, productId]) => ({
			productId,
			name: `Product ${productId}`,
			category: "Other",
			description: "Item",
			price: 1,
			imageURL,
		}));
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(products)));
		const res = await request(createApp({ fetch: fetchApi })).get("/products");

		expect(res.text).toContain('src="/images/TeamB-tshirt-front.png"');
		expect(res.text).not.toContain("evil.example");
		expect(res.text).not.toContain("javascript:");
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
});
