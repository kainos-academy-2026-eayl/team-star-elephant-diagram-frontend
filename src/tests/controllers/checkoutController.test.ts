import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app";
import { loginResponse } from "../testHelpers";

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
});
