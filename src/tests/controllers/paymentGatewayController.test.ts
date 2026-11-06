import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";

describe("payment gateway", () => {
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

	it("requires login to place an order after valid payment details", async () => {
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

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to complete payment");
	});

	it("shows an error when the reservation has expired before payment", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error:
						"Your reservation has expired. Please proceed to checkout again.",
				}),
				{ status: 410 },
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.set("Cookie", "accessToken=access-one")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "4532015112830366",
				expiry: "12/25",
				cvc: "123",
				useExistingAddress: "true",
			});

		expect(res.status).toBe(409);
		expect(res.text).toContain("Your reservation has expired");
	});

	it("creates a processing order from the reservation on valid payment", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					success: true,
					order: {
						orderId: 42,
						orderStatus: "PROCESSING",
						cost: "7.00",
						orderPlacedAt: "2026-11-05T09:00:00.000Z",
						items: [{ productId: 1, quantity: 2 }],
					},
				}),
				{ status: 201 },
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/payment_gateway")
			.set("Cookie", "accessToken=access-one")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "4532015112830366",
				expiry: "12/25",
				cvc: "123",
				useExistingAddress: "true",
			});

		expect(res.status).toBe(201);
		expect(res.text).toContain("Order #42 is processing");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/orders/from-reservation",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.method).toBe("POST");
	});

	it("accepts valid payment submission", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					order: {
						orderId: 7,
						orderStatus: "PROCESSING",
						cost: "7.00",
						orderPlacedAt: "2026-11-05T09:00:00.000Z",
						items: [],
					},
				}),
				{ status: 201 },
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.set("Cookie", "accessToken=access-one")
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

		expect(res.status).toBe(201);
		expect(res.text).toContain("Payment");
	});
});
