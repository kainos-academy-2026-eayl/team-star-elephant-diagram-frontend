import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

describe("profile", () => {
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
		)
			.get("/profile")
			.set("Cookie", "accessToken=customer-access");

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
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/profile")
			.set("Cookie", "accessToken=customer-access");

		expect(res.status).toBe(503);
		expect(res.text).toContain("Your profile is temporarily unavailable.");
		expect(res.text).not.toContain("You haven't placed any orders yet.");
		expect(res.text).not.toContain("Connection refused");
	});
});
