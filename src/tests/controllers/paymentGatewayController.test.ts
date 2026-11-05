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
