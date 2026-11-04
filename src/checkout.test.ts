import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { loginResponse } from "./testHelpers";

describe("checkout", () => {
	it("refreshes browser credentials and preserves the basket cookie at checkout", async () => {
		const basketId = "8e0dcfff-1528-4ec6-9820-b8c9a6732000";
		const basket = {
			items: [
				{
					productId: 1,
					productName: "Green tea",
					quantity: 2,
					unitPrice: 3.5,
				},
			],
			subtotal: 7,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "Unauthorized" }), {
					status: 401,
				}),
			)
			.mockResolvedValueOnce(loginResponse())
			.mockResolvedValueOnce(new Response(JSON.stringify(basket)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/checkout")
			.set(
				"Cookie",
				`accessToken=expired-access; refreshToken=refresh-one; basketId=${basketId}; session=private`,
			);

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "expired-access"].join(" "),
		});
		expect(fetchApi.mock.calls[1]?.[1]?.headers).toMatchObject({
			Cookie: "refreshToken=refresh-one",
		});
		expect(fetchApi.mock.calls[2]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: `basketId=${basketId}`,
		});
	});

	it("treats rejected checkout credentials as login-required", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			}),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/checkout")
			.set("Cookie", "accessToken=expired-access");

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to proceed to checkout.");
		expect(res.text).not.toContain("temporarily unavailable");
	});

	it("does not show payment details when opened without basket credentials", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/payment_gateway");

		expect(res.status).toBe(401);
		expect(fetchApi).not.toHaveBeenCalled();
		expect(res.text).toContain("Please log in to complete payment");
	});

	it("shows a clear unavailable response when the basket service is offline", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/payment_gateway")
			.set("Authorization", "Bearer test-token");

		expect(res.status).toBe(503);
		expect(res.text).toContain("Payment gateway is temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
	});

	it("requires authentication to access payment page", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/payment_gateway",
		);

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in");
	});

	it("rejects payment form with missing fields", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ nameOnCard: "John Doe" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("valid");
	});

	it("validates card number format", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "invalid",
				expiry: "12/25",
				cvc: "123",
				fullName: "John Doe",
				addressLine1: "123 Main St",
				city: "London",
				postcode: "SW1A 1AA",
				country: "UK",
			});

		expect(res.status).toBe(400);
		expect(res.text).toContain("valid card number");
	});

	it("validates expiry date format", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "4532015112830366",
				expiry: "12-25",
				cvc: "123",
				fullName: "John Doe",
				addressLine1: "123 Main St",
				city: "London",
				postcode: "SW1A 1AA",
				country: "UK",
			});

		expect(res.status).toBe(400);
		expect(res.text).toContain("expiry date");
	});

	it("accepts valid payment submission", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "4532015112830366",
				expiry: "12/25",
				cvc: "123",
				fullName: "John Doe",
				addressLine1: "123 Main St",
				city: "London",
				postcode: "SW1A 1AA",
				country: "UK",
			});

		expect(res.status).toBe(200);
		expect(res.text).toContain("Payment");
	});
});
