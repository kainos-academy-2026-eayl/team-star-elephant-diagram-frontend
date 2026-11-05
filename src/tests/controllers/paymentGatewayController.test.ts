import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { loginResponse } from "../testHelpers";

describe("payment gateway", () => {
	const basket = {
		items: [
			{ productId: 1, productName: "Green tea", quantity: 2, unitPrice: 3.5 },
		],
		subtotal: 7,
	};
	const profile = {
		user: {
			firstName: "John",
			lastName: "Doe",
			addressLine1: "123 Main St",
			city: "London",
			postcode: "SW1A 1AA",
		},
	};
	const order = {
		orderId: 42,
		orderStatus: "PROCESSING",
		cost: "7.00",
		items: [{ productId: 1, quantity: 2 }],
	};

	it("opens payment with browser session cookies instead of an Authorization header", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(JSON.stringify(basket)))
			.mockResolvedValueOnce(new Response(JSON.stringify(profile)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/payment_gateway")
			.set(
				"Cookie",
				"accessToken=access-one; basketId=basket-one; tracking=private",
			);

		expect(res.status).toBe(200);
		expect(res.text).toContain("Use saved address");
		expect(res.text).toContain("123 Main St");
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: "basketId=basket-one",
		});
		expect(res.headers["cache-control"]).toBe("no-store");
	});

	it.each([
		"accessToken=expired-access; refreshToken=refresh-old",
		"refreshToken=refresh-old",
	])(
		"refreshes payment access once for both basket and saved address using %s",
		async (cookie) => {
			const fetchApi = vi.fn<typeof fetch>();
			if (cookie.includes("accessToken=")) {
				fetchApi.mockResolvedValueOnce(
					new Response(JSON.stringify({ error: "Expired" }), { status: 401 }),
				);
			}
			fetchApi
				.mockResolvedValueOnce(loginResponse())
				.mockResolvedValueOnce(new Response(JSON.stringify(basket)))
				.mockResolvedValueOnce(new Response(JSON.stringify(profile)));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/payment_gateway")
				.set("Cookie", cookie);

			expect(res.status).toBe(200);
			expect(res.text).toContain("123 Main St");
			const calls = fetchApi.mock.calls;
			expect(
				calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
			).toHaveLength(1);
			expect(calls.at(-1)?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "access-one"].join(" "),
			});
			expect(res.headers["set-cookie"]).toHaveLength(2);
		},
	);

	it("rejects an empty basket for a signed-in browser", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: [], subtotal: 0 })),
			);
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/payment_gateway")
			.set("Cookie", "accessToken=access-one");

		expect(res.status).toBe(400);
		expect(res.text).toContain("Your basket is empty");
		expect(fetchApi).toHaveBeenCalledTimes(1);
	});

	it("requires login when payment session refresh is rejected", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Expired session" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/payment_gateway")
			.set("Cookie", "refreshToken=expired-refresh");

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to complete payment");
		expect(res.headers["set-cookie"]).toHaveLength(2);
	});

	it("reuses refreshed credentials when saving a new address and placing the order", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "Expired" }), { status: 401 }),
			)
			.mockResolvedValueOnce(loginResponse())
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ order }), { status: 201 }),
			);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.set("Cookie", "accessToken=expired-access; refreshToken=refresh-old")
			.type("form")
			.send({
				nameOnCard: "John Doe",
				cardNumber: "4532015112830366",
				expiry: "12/29",
				cvc: "123",
				useExistingAddress: "false",
				fullName: "John Doe",
				addressLine1: "123 Main St",
				city: "London",
				postcode: "SW1A 1AA",
			});

		expect(res.status).toBe(201);
		expect(res.text).toContain("Payment complete. Your order is processing.");
		expect(res.text).not.toContain("Order #42");
		expect(fetchApi).toHaveBeenCalledTimes(4);
		expect(String(fetchApi.mock.calls[3]?.[0])).toContain(
			"/orders/from-reservation",
		);
		expect(fetchApi.mock.calls[3]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "access-one"].join(" "),
		});
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
		expect(res.text).toContain("Payment complete. Your order is processing.");
		expect(res.text).not.toContain("Order #42");
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
