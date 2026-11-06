import { describe, expect, it, vi } from "vitest";
import { BackendApi, BackendApiError } from "../../backendApi";
import { BasketService } from "../../services/basketService";

const basket = {
	items: [
		{ productId: 7, productName: "Kettle", quantity: 2, unitPrice: 24.99 },
	],
	subtotal: 49.98,
};
const authorization = ["Bearer", "access-token"].join(" ");
const credentials = { authorization, cookie: "basketId=abc" };

const json = (
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });

const setup = () => {
	const fetchMock = vi.fn<typeof fetch>();
	const service = new BasketService(
		new BackendApi("http://backend:4000", fetchMock),
	);
	return { fetchMock, service };
};

const sentRequest = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) => {
	const [url, init] = fetchMock.mock.calls[0] ?? [];
	return {
		url: String(url),
		method: init?.method,
		headers: init?.headers,
		body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
	};
};

describe("BasketService", () => {
	it("fetches the basket forwarding the caller's credentials", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json(basket));

		await expect(service.getBasket(credentials)).resolves.toEqual(basket);

		expect(sentRequest(fetchMock)).toEqual({
			url: "http://backend:4000/basket",
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: authorization,
				Cookie: "basketId=abc",
			},
			body: undefined,
		});
	});

	it("omits credential headers that were not supplied", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json(basket));

		await service.getBasket({ authorization: "", cookie: "" });

		expect(sentRequest(fetchMock).headers).toEqual({
			"Content-Type": "application/json",
		});
	});

	it("adds an item and returns the basket with any backend cookies", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json(basket, 201, { "Set-Cookie": "basketId=new; Path=/; HttpOnly" }),
		);

		const result = await service.addItem(7, 2, { cookie: "basketId=abc" });

		expect(result).toEqual({
			basket,
			cookies: ["basketId=new; Path=/; HttpOnly"],
		});
		expect(sentRequest(fetchMock)).toEqual({
			url: "http://backend:4000/basket",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: "basketId=abc",
			},
			body: { productId: 7, quantity: 2 },
		});
	});

	it("updates an item quantity with a PATCH", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json(basket));

		await expect(
			service.updateItemQuantity(7, 5, { authorization }),
		).resolves.toEqual(basket);

		expect(sentRequest(fetchMock)).toEqual({
			url: "http://backend:4000/basket/items/7",
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Authorization: authorization,
			},
			body: { quantity: 5 },
		});
	});

	it("removes an item with a DELETE and no body", async () => {
		const empty = { items: [], subtotal: 0 };
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json(empty));

		await expect(service.removeItem(7, credentials)).resolves.toEqual(empty);

		expect(sentRequest(fetchMock)).toMatchObject({
			url: "http://backend:4000/basket/items/7",
			method: "DELETE",
			body: undefined,
		});
	});

	it("rejects with the backend error when the request fails", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json(
				{ error: "Not enough stock", details: { quantity: ["Max 3"] } },
				409,
			),
		);

		const error = await service
			.addItem(7, 10, credentials)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(BackendApiError);
		expect(error).toMatchObject({
			status: 409,
			message: "Not enough stock",
			details: { quantity: ["Max 3"] },
		});
	});

	it("propagates network failures", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

		await expect(service.getBasket(credentials)).rejects.toThrow(
			"fetch failed",
		);
	});
});
