import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const BACKEND = "http://backend:4000";
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

const permissions = (canEdit: boolean) => ({
	view: true,
	create: canEdit,
	update: canEdit,
	delete: canEdit,
});
const dashboard = (canEdit = true) => ({
	staff: { name: "Staff member" },
	role: canEdit ? "Admin" : "CustomerService",
	sections: [{ label: "Baskets" }],
	quickActions: [],
	basketPermissions: permissions(canEdit),
});

const basketPage = {
	basket: {
		basketId: 123,
		createdAt: "2026-10-20",
		lastActivity: "2026-10-25",
		status: "Active",
		customer: { id: 2, name: "Grace Hopper", email: "grace@example.com" },
		items: [
			{
				productId: 1,
				productName: "Green tea",
				quantity: 2,
				unitPrice: "£3.50",
				totalPrice: "£7.00",
				availableStock: 10,
				maxQuantity: 10,
				exceedsStock: false,
			},
			{
				productId: 2,
				productName: "Coffee beans",
				quantity: 5,
				unitPrice: "£39.00",
				totalPrice: "£195.00",
				availableStock: 3,
				maxQuantity: 3,
				exceedsStock: true,
			},
		],
		itemCount: 7,
		total: "£202.00",
	},
	products: [
		{
			productId: 3,
			name: "Kettle",
			unitPrice: "£25.00",
			availableStock: 4,
			maxQuantity: 4,
		},
	],
};

type Route = (url: string, init?: RequestInit) => Response | undefined;

// Routes /admin to the dashboard (permissions) and everything else to `route`.
const backend = (route: Route, canEdit = true) =>
	vi.fn<typeof fetch>(async (input, init) => {
		const url = String(input);
		if (url === `${BACKEND}/admin`) return json(dashboard(canEdit));
		return route(url, init) ?? json(basketPage);
	});

const app = (fetchApi: typeof fetch) =>
	createApp({ apiBaseUrl: BACKEND, fetch: fetchApi });

const post = (fetchApi: typeof fetch, path: string, body = {}) =>
	request(app(fetchApi))
		.post(path)
		.set("Host", "shop.example")
		.set("Origin", "http://shop.example")
		.set("Cookie", "accessToken=staff-access")
		.type("form")
		.send(body);

const mutationCalls = (fetchApi: ReturnType<typeof backend>) =>
	fetchApi.mock.calls
		.filter(([, init]) => init?.method && init.method !== "GET")
		.map(([input, init]) => [
			init?.method,
			String(input),
			init?.body ? JSON.parse(String(init.body)) : undefined,
		]);

describe("admin basket management", () => {
	it("shows stock-aware editing controls to staff with basket permissions", async () => {
		const fetchApi = backend(() => undefined);
		const res = await request(app(fetchApi))
			.get("/admin/baskets/123?notice=updated")
			.set("Cookie", "accessToken=staff-access");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Quantity updated.");
		expect(res.text).toContain('action="/admin/baskets/123/items/1"');
		expect(res.text).toMatch(/name="quantity"[^>]*value="2" min="1" max="10"/);
		expect(res.text).toContain('action="/admin/baskets/123/items/2/remove"');
		expect(res.text).toContain("3 &ndash; exceeds stock");
		expect(res.text).toContain('action="/admin/baskets/123/items"');
		expect(res.text).toContain("Kettle &ndash; £25.00 (4 in stock)");
		expect(res.text).toContain('action="/admin/baskets/123/clear"');
		expect(res.text).toContain('action="/admin/baskets/123/delete"');
		expect(res.text).toContain('href="/admin/users/2"');
		expect(res.text).not.toContain("<script");
	});

	it("keeps the basket read-only for view-only staff", async () => {
		const fetchApi = backend(() => undefined, false);
		const res = await request(app(fetchApi))
			.get("/admin/baskets/123")
			.set("Cookie", "accessToken=staff-access");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("3 &ndash; exceeds stock");
		expect(res.text).not.toContain('action="/admin/baskets/123/items');
		expect(res.text).not.toContain("/clear");
		expect(res.text).not.toContain('action="/admin/baskets/123/delete"');
	});

	it("shows the create form on the list only to staff who can create baskets", async () => {
		for (const canEdit of [true, false]) {
			const fetchApi = backend(() => json({ baskets: [] }), canEdit);
			const res = await request(app(fetchApi))
				.get("/admin/baskets?notice=deleted")
				.set("Cookie", "accessToken=staff-access");
			expect(res.status).toBe(200);
			expect(res.text).toContain("Basket deleted.");
			expect(res.text.includes('action="/admin/baskets" method="post"')).toBe(
				canEdit,
			);
		}
	});

	it.each([
		[
			"/admin/baskets/123/items",
			{ productId: "3", quantity: "2" },
			[
				"POST",
				`${BACKEND}/admin/baskets/123/items`,
				{ productId: 3, quantity: 2 },
			],
			"added",
		],
		[
			"/admin/baskets/123/items/1",
			{ quantity: "4" },
			["PATCH", `${BACKEND}/admin/baskets/123/items/1`, { quantity: 4 }],
			"updated",
		],
		[
			"/admin/baskets/123/items/1/remove",
			{},
			["DELETE", `${BACKEND}/admin/baskets/123/items/1`, undefined],
			"removed",
		],
		[
			"/admin/baskets/123/clear",
			{ confirm: "yes" },
			["DELETE", `${BACKEND}/admin/baskets/123/items`, undefined],
			"cleared",
		],
	])(
		"POST %s calls the backend and returns to the basket",
		async (path, body, call, notice) => {
			const fetchApi = backend(() => undefined);
			const res = await post(fetchApi, path, body);

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(`/admin/baskets/123?notice=${notice}`);
			expect(mutationCalls(fetchApi)).toEqual([call]);
			const mutation = fetchApi.mock.calls.find(
				([input]) => String(input) === call[1],
			);
			expect(mutation?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "staff-access"].join(" "),
			});
		},
	);

	it("deletes a confirmed basket and returns to the list", async () => {
		const fetchApi = backend(() => json({ deleted: true }));
		const res = await post(fetchApi, "/admin/baskets/123/delete", {
			confirm: "yes",
		});

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/admin/baskets?notice=deleted");
		expect(mutationCalls(fetchApi)).toEqual([
			["DELETE", `${BACKEND}/admin/baskets/123`, undefined],
		]);
	});

	it.each([
		["/admin/baskets/123/clear", {}, "Confirm before emptying this basket."],
		["/admin/baskets/123/delete", {}, "Confirm before deleting this basket."],
		[
			"/admin/baskets/123/items",
			{ productId: "x", quantity: "1" },
			"Choose a product.",
		],
		[
			"/admin/baskets/123/items/1",
			{ quantity: "0" },
			"Enter a quantity of at least 1.",
		],
	])(
		"rejects invalid input for %s without changing the basket",
		async (path, body, message) => {
			const fetchApi = backend(() => undefined);
			const res = await post(fetchApi, path, body);

			expect(res.status).toBe(400);
			expect(res.text).toContain(message);
			expect(res.text).toContain("Basket #123");
			expect(mutationCalls(fetchApi)).toEqual([]);
		},
	);

	it("shows backend stock limits on the basket page", async () => {
		const fetchApi = backend((_url, init) =>
			init?.method === "PATCH"
				? json(
						{ error: "Quantity cannot exceed 3 (3 in stock)", code: "stock" },
						409,
					)
				: undefined,
		);
		const res = await post(fetchApi, "/admin/baskets/123/items/2", {
			quantity: "5",
		});

		expect(res.status).toBe(409);
		expect(res.text).toContain("Quantity cannot exceed 3 (3 in stock)");
		expect(res.text).toContain("Coffee beans");
	});

	it("renders not found when the basket no longer exists", async () => {
		const fetchApi = backend((_url, init) =>
			init?.method === "DELETE"
				? json({ error: "Basket not found" }, 404)
				: undefined,
		);
		const res = await post(fetchApi, "/admin/baskets/123/items/1/remove");

		expect(res.status).toBe(404);
		expect(res.text).toContain("Basket not found");
	});

	it("blocks staff without basket permissions before calling the backend", async () => {
		const fetchApi = backend(() => undefined, false);
		const res = await post(fetchApi, "/admin/baskets/123/items", {
			productId: "3",
			quantity: "1",
		});

		expect(res.status).toBe(403);
		expect(mutationCalls(fetchApi)).toEqual([]);
	});

	it("rejects cross-origin basket changes", async () => {
		const fetchApi = backend(() => undefined);
		const res = await request(app(fetchApi))
			.post("/admin/baskets/123/delete")
			.set("Host", "shop.example")
			.set("Origin", "http://evil.example")
			.set("Cookie", "accessToken=staff-access")
			.type("form")
			.send({ confirm: "yes" });

		expect(res.status).toBe(403);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("creates a basket for a customer by email", async () => {
		const fetchApi = backend((url, init) =>
			url === `${BACKEND}/admin/baskets` && init?.method === "POST"
				? json({ basketId: 789 }, 201)
				: undefined,
		);
		const res = await post(fetchApi, "/admin/baskets", {
			email: " ada@example.com ",
		});

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/admin/baskets/789?notice=created");
		expect(mutationCalls(fetchApi)).toEqual([
			["POST", `${BACKEND}/admin/baskets`, { email: "ada@example.com" }],
		]);
	});

	it("sends staff to the existing basket when the customer already has one", async () => {
		const fetchApi = backend((url, init) =>
			url === `${BACKEND}/admin/baskets` && init?.method === "POST"
				? json(
						{
							error: "This customer already has a basket",
							code: "exists",
							basketId: 123,
						},
						409,
					)
				: undefined,
		);
		const res = await post(fetchApi, "/admin/baskets", {
			email: "grace@example.com",
		});

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe(
			"/admin/baskets?q=grace%40example.com&notice=exists",
		);
	});

	it("shows an error on the list when the customer does not exist", async () => {
		const fetchApi = backend((url, init) => {
			if (url === `${BACKEND}/admin/baskets` && init?.method === "POST") {
				return json(
					{
						error: "No customer has that email address",
						code: "customer_not_found",
					},
					404,
				);
			}
			return json({ baskets: [] });
		});
		const res = await post(fetchApi, "/admin/baskets", {
			email: "nobody@example.com",
		});

		expect(res.status).toBe(404);
		expect(res.text).toContain("No customer has that email address");
		expect(res.text).toContain('value="nobody@example.com"');
	});
});
