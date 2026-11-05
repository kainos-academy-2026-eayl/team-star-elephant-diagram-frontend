import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const app = createApp();

describe("pages", () => {
	it("GET /health returns ok", async () => {
		const res = await request(app).get("/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
	});

	it("GET / renders the homepage with the burger menu", async () => {
		const res = await request(app).get("/");

		expect(res.status).toBe(200);
		expect(res.text).toContain("SEDSHED");
		expect(res.text).toContain('id="site-menu"');
		expect(res.text).toContain('commandfor="site-menu"');
		expect(res.text).not.toContain("<script");
		expect(res.text).toContain("Electronics Shop");
	});

	it("GET / shows no cart badge and skips the backend when logged out", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi })).get("/");

		expect(res.status).toBe(200);
		expect(res.text).not.toContain("cart-link__badge");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("GET / shows the total basket quantity on the cart icon", async () => {
		const basketId = "8e0dcfff-1528-4ec6-9820-b8c9a6732000";
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{ productId: 1, productName: "A", quantity: 2, unitPrice: 1 },
						{ productId: 2, productName: "B", quantity: 3, unitPrice: 1 },
					],
					subtotal: 5,
				}),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/")
			.set("Cookie", `accessToken=access-one; basketId=${basketId}`);

		expect(res.status).toBe(200);
		expect(res.text).toMatch(/class="cart-link__badge"[^>]*>5</);
		expect(res.text).toContain('aria-label="Basket, 5 items"');
		expect(res.text).toContain('class="menu-item__badge">5<');
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: `basketId=${basketId}`,
		});
	});

	it.each([
		[1, "1", "Basket, 1 item"],
		[120, "99+", "Basket, 120 items"],
	])(
		"GET / formats a basket of %i items as %s",
		async (quantity, text, label) => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(
					JSON.stringify({
						items: [{ productId: 1, productName: "A", quantity, unitPrice: 1 }],
						subtotal: quantity,
					}),
				),
			);
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/")
				.set("Cookie", "accessToken=access-one");

			expect(res.text).toMatch(
				new RegExp(
					`class="cart-link__badge"[^>]*>${text.replace("+", "\\+")}<`,
				),
			);
			expect(res.text).toContain(`aria-label="${label}"`);
		},
	);

	it("GET / still renders without a badge when the basket is unavailable", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response("{}", { status: 503 }));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/")
			.set("Cookie", "accessToken=access-one");

		expect(res.status).toBe(200);
		expect(res.text).toContain("SEDSHED");
		expect(res.text).not.toContain("cart-link__badge");
	});

	it.each(["/home.css", "/images/home/slide.png"])(
		"serves the homepage asset %s",
		async (path) => {
			const res = await request(app).get(path);

			expect(res.status).toBe(200);
		},
	);
});
