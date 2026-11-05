import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type {
	InventoryPermissions,
	InventoryProduct,
} from "./models/inventory";

const all = { view: true, create: true, update: true, delete: true };
const read = { view: true, create: false, update: false, delete: false };
const none = { view: false, create: false, update: false, delete: false };
const product: InventoryProduct = {
	productId: 7,
	name: "Tea <special>",
	sku: "TEA-7",
	description: "Fresh tea",
	category: "Drinks",
	price: "2.50",
	imageURL: "https://example.com/tea.png",
	stockQuantity: 10,
	lowStockThreshold: 5,
	stockStatus: "IN_STOCK",
};
const form = {
	name: "Tea",
	description: "Fresh tea",
	price: "2.50",
	category: "Drinks",
	sku: "TEA-7",
	imageURL: "https://example.com/tea.png",
	stockQuantity: "10",
	lowStockThreshold: "5",
	supplierId: "2",
	reason: "Stock count",
};

function fixture(
	permissions: InventoryPermissions = all,
	role = "InventoryManager",
) {
	const dashboard = {
		staff: { name: "Inventory staff" },
		role,
		sections: permissions.view ? [{ label: "Inventory" }] : [],
		quickActions: [],
		cards: [],
		recentOrders: [],
		newUsers: [],
		stockChanges: [],
		inventoryPermissions: permissions,
		inventorySummary: {
			totalProducts: 12,
			lowStockProducts: 3,
			outOfStockProducts: 2,
		},
	};
	const fetchApi = vi
		.fn<typeof fetch>()
		.mockImplementation(async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			const json = (body: unknown, status = 200) =>
				new Response(JSON.stringify(body), { status });
			if (url.pathname === "/admin") return json(dashboard);
			if (url.pathname === "/api/admin/inventory/suppliers")
				return json({ suppliers: [{ supplierId: 2, name: "Tea supplier" }] });
			if (url.pathname.endsWith("/history"))
				return json({
					items: [
						{
							id: "adjustment-1",
							createdAt: "2026-11-05T12:30:00Z",
							adjustedById: 3,
							adjustedBy: { adminId: 3, forename: "Ada", surname: "Staff" },
							adjustment: -2,
							previousStock: 12,
							newStock: 10,
							reason: "Damaged",
						},
					],
					totalItems: 21,
					totalPages: 2,
					currentPage: Number(url.searchParams.get("page") ?? 1),
				});
			if (url.pathname === "/api/admin/inventory" && method === "GET")
				return json({
					items: [product],
					totalItems: 41,
					totalPages: 3,
					currentPage: Number(url.searchParams.get("page") ?? 1),
				});
			if (url.pathname === "/api/admin/inventory" && method === "POST")
				return json(product, 201);
			if (url.pathname === "/api/admin/inventory/7" && method === "GET")
				return json({ product });
			if (
				url.pathname.startsWith("/api/admin/inventory/7") &&
				["PUT", "PATCH", "DELETE"].includes(method)
			)
				return json(product);
			return json({ error: "Unexpected API request" }, 404);
		});
	const app = createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi });
	const get = (path: string) =>
		request(app).get(path).set("Cookie", "accessToken=staff-access");
	const post = (path: string, body: Record<string, string>) =>
		request(app)
			.post(path)
			.set("Host", "admin.test")
			.set("Origin", "http://admin.test")
			.set("Cookie", "accessToken=staff-access")
			.type("form")
			.send(body);
	return { app, fetchApi, dashboard, get, post };
}

describe("admin inventory", () => {
	it("adds the permission-scoped dashboard card and existing icon navigation", async () => {
		const { get } = fixture();
		const res = await get("/admin");
		expect(res.status).toBe(200);
		for (const text of [
			"Inventory Management",
			"Total Products",
			"Low Stock Products",
			"Out Of Stock Products",
			'href="/admin/inventory"',
			"<dd>12</dd>",
			"<dd>3</dd>",
			"<dd>2</dd>",
		])
			expect(res.text).toContain(text);
	});

	it("hides inventory links, metrics and card without permission, even for inconsistent sections", async () => {
		const { get, dashboard } = fixture(none);
		dashboard.sections = [{ label: "Inventory" }];
		const res = await get("/admin");
		expect(res.text).not.toContain('href="/admin/inventory"');
		expect(res.text).not.toContain("Inventory Management");
		expect(res.text).not.toContain("Total Products");
	});

	it("preserves the finance-only dashboard while allowing permission-granted read-only inventory URLs", async () => {
		const { get } = fixture(read, "FinanceManager");
		expect((await get("/admin")).text).not.toContain('href="/admin/inventory"');
		const res = await get("/admin/inventory");
		expect(res.status).toBe(200);
		expect(res.text).not.toContain("Create product");
	});

	it.each([
		["SuperAdmin", all],
		["InventoryManager", all],
		["WarehouseStaff", { ...read, update: true }],
		["Admin", read],
		["CustomerService", read],
	] as const)(
		"renders only backend-granted actions for %s",
		async (role, permissions) => {
			const { get } = fixture(permissions, role);
			const res = await get("/admin/inventory");
			expect(res.status).toBe(200);
			expect(res.text.includes("Create product")).toBe(permissions.create);
			expect(res.text.includes('href="/admin/inventory/7/edit"')).toBe(
				permissions.update,
			);
			expect(res.text.includes("Confirm deletion")).toBe(permissions.delete);
			const details = await get("/admin/inventory/7");
			expect(details.text.includes("Adjust stock")).toBe(permissions.update);
			expect(details.text.includes("Set threshold")).toBe(permissions.update);
			expect(details.text).toContain("Adjustment history");
		},
	);

	it.each([
		["GET", "/admin/inventory"],
		["GET", "/admin/inventory/new"],
		["GET", "/admin/inventory/7"],
		["GET", "/admin/inventory/7/edit"],
		["POST", "/admin/inventory"],
		["POST", "/admin/inventory/7"],
		["POST", "/admin/inventory/7/delete"],
		["POST", "/admin/inventory/7/stock"],
		["POST", "/admin/inventory/7/threshold"],
	])("protects %s %s without inventory:view", async (method, path) => {
		const { get, post, fetchApi } = fixture(none);
		const res = method === "GET" ? await get(path) : await post(path, form);
		expect(res.status).toBe(403);
		expect(res.text).toContain("Access denied");
		expect(res.text).not.toContain("Adjustment history");
		expect(
			fetchApi.mock.calls.every(
				([url]) => new URL(String(url)).pathname === "/admin",
			),
		).toBe(true);
	});

	it.each([
		["/admin/inventory", form],
		["/admin/inventory/7", form],
		["/admin/inventory/7/delete", { confirmDelete: "yes" }],
		["/admin/inventory/7/stock", { adjustment: "2", reason: "Delivery" }],
		["/admin/inventory/7/threshold", { lowStockThreshold: "2" }],
	])(
		"denies forged write requests for view-only staff: %s",
		async (path, body) => {
			const { post, fetchApi } = fixture(read);
			expect((await post(path, body)).status).toBe(403);
			expect(fetchApi.mock.calls).toHaveLength(1);
		},
	);

	it("redirects anonymous staff and customers without reading inventory", async () => {
		const { app, fetchApi } = fixture();
		const anonymous = await request(app).get("/admin/inventory/7");
		expect(anonymous.status).toBe(303);
		expect(anonymous.headers.location).toBe(
			"/admin/login?returnTo=%2Fadmin%2Finventory%2F7",
		);
		const token = `header.${Buffer.from(JSON.stringify({ kind: "customer" })).toString("base64url")}.signature`;
		const customer = await request(app)
			.get("/admin/inventory")
			.set("Cookie", `accessToken=${token}`);
		expect(customer.headers.location).toBe("/products");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("renders products, escaped text, status, filtering, sorting and pagination using backend queries", async () => {
		const { get, fetchApi } = fixture();
		const res = await get(
			"/admin/inventory?q=tea&status=LOW_STOCK&sort=price&direction=desc&page=2",
		);
		expect(res.status).toBe(200);
		for (const text of [
			"Tea &lt;special&gt;",
			"TEA-7",
			"£2.50",
			"In Stock",
			"Page 2 of 3",
			"Previous",
			"Next",
		])
			expect(res.text).toContain(text);
		const call = fetchApi.mock.calls.find(
			([url]) => new URL(String(url)).pathname === "/api/admin/inventory",
		);
		expect(new URL(String(call?.[0])).searchParams.get("search")).toBe("tea");
		expect(new URL(String(call?.[0])).searchParams.get("sort")).toBe("price");
		expect(new URL(String(call?.[0])).searchParams.get("direction")).toBe(
			"desc",
		);
		expect(new URL(String(call?.[0])).searchParams.get("status")).toBe(
			"LOW_STOCK",
		);
		expect(res.text).toContain(
			"q=tea&amp;status=LOW_STOCK&amp;sort=price&amp;direction=desc&amp;page=3",
		);
	});

	it("creates a supplier-backed product using the shared session API", async () => {
		const { get, post, fetchApi } = fixture();
		expect((await get("/admin/inventory/new")).text).toContain("Tea supplier");
		const res = await post("/admin/inventory", form);
		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/admin/inventory/7?notice=created");
		const init = fetchApi.mock.calls.find(
			([, init]) => init?.method === "POST",
		)?.[1];
		expect(JSON.parse(String(init?.body))).toEqual({
			name: "Tea",
			description: "Fresh tea",
			price: "2.50",
			category: "Drinks",
			sku: "TEA-7",
			imageURL: form.imageURL,
			stockQuantity: 10,
			lowStockThreshold: 5,
			supplierId: 2,
		});
		expect(init?.headers).toMatchObject({
			Authorization: "Bearer staff-access",
		});
	});

	it("edits products with absolute stock and an audit reason; SKU stays immutable", async () => {
		const { get, post, fetchApi } = fixture();
		const edit = await get("/admin/inventory/7/edit");
		expect(edit.status).toBe(200);
		expect(edit.text).toContain("SKU (cannot be changed)");
		const res = await post("/admin/inventory/7", {
			...form,
			name: "New tea",
			stockQuantity: "8",
		});
		expect(res.headers.location).toBe("/admin/inventory/7?notice=updated");
		const body = JSON.parse(
			String(
				fetchApi.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]
					?.body,
			),
		);
		expect(body).toMatchObject({
			name: "New tea",
			stockQuantity: 8,
			reason: "Stock count",
		});
		expect(body).not.toHaveProperty("sku");
		expect(body).not.toHaveProperty("supplierId");
	});

	it("requires explicit deletion confirmation and renders a cancel-first confirmation modal", async () => {
		const { get, post, fetchApi } = fixture();
		const list = await get("/admin/inventory");
		expect(list.text).toContain(
			"Are you sure you wish to delete this product?",
		);
		expect(list.text).toContain('<dialog id="delete-product-7"');
		expect(list.text).toContain("autofocus>Cancel</button>");
		expect((await post("/admin/inventory/7/delete", {})).status).toBe(400);
		expect(
			fetchApi.mock.calls.some(([, init]) => init?.method === "DELETE"),
		).toBe(false);
		const res = await post("/admin/inventory/7/delete", {
			confirmDelete: "yes",
		});
		expect(res.headers.location).toBe("/admin/inventory?notice=deleted");
		expect(
			fetchApi.mock.calls.some(([, init]) => init?.method === "DELETE"),
		).toBe(true);
	});

	it.each(["4", "-3"])(
		"adjusts stock by %s with an audit reason",
		async (adjustment) => {
			const { post, fetchApi } = fixture();
			const res = await post("/admin/inventory/7/stock", {
				adjustment,
				reason: "Delivery count",
			});
			expect(res.headers.location).toBe("/admin/inventory/7?notice=stock");
			const init = fetchApi.mock.calls.find(
				([, init]) => init?.method === "PATCH",
			)?.[1];
			expect(JSON.parse(String(init?.body))).toEqual({
				adjustment: Number(adjustment),
				reason: "Delivery count",
			});
		},
	);

	it("sets the threshold including zero", async () => {
		const { post, fetchApi } = fixture();
		const res = await post("/admin/inventory/7/threshold", {
			lowStockThreshold: "0",
		});
		expect(res.headers.location).toBe("/admin/inventory/7?notice=threshold");
		expect(
			JSON.parse(
				String(
					fetchApi.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]
						?.body,
				),
			),
		).toEqual({ lowStockThreshold: 0 });
	});

	it("shows paginated adjustment history with date, actor, reason and before/after stock", async () => {
		const { get, fetchApi } = fixture();
		const res = await get("/admin/inventory/7?page=2");
		expect(res.status).toBe(200);
		for (const text of [
			"Adjustment history",
			"Ada Staff",
			"Damaged",
			"5 Nov 2026",
			"Page 2 of 2",
			"<td>-2</td>",
			"<td>12</td>",
			"<td>10</td>",
		])
			expect(res.text).toContain(text);
		expect(
			fetchApi.mock.calls.some(([url]) =>
				String(url).endsWith("/7/history?page=2"),
			),
		).toBe(true);
	});

	it.each(["-1", "1.5", "NaN", "", "2147483648"])(
		"rejects malformed stock %s and preserves entered values",
		async (stockQuantity) => {
			const { post, fetchApi } = fixture();
			const res = await post("/admin/inventory", {
				...form,
				name: "Entered name",
				stockQuantity,
			});
			expect(res.status).toBe(400);
			expect(res.text).toContain('value="Entered name"');
			expect(res.text).toContain("Enter a valid whole number.");
			expect(
				fetchApi.mock.calls.some(([, init]) => init?.method === "POST"),
			).toBe(false);
		},
	);

	it("rejects cross-origin mutations without API calls", async () => {
		const { app, fetchApi } = fixture();
		const res = await request(app)
			.post("/admin/inventory/7/delete")
			.set("Host", "admin.test")
			.set("Origin", "http://evil.test")
			.send({ confirmDelete: "yes" });
		expect(res.status).toBe(403);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("handles backend permission revocation, conflicts and outages explicitly", async () => {
		for (const [status, message] of [
			[403, "Access denied"],
			[409, "SKU already exists"],
			[500, "temporarily unavailable"],
		] as const) {
			const { post, fetchApi } = fixture();
			const base = fetchApi.getMockImplementation();
			fetchApi.mockImplementation(async (input, init) =>
				init?.method === "POST"
					? new Response(
							JSON.stringify({
								error: "SKU already exists",
								details: { sku: ["Choose a unique SKU"] },
							}),
							{ status },
						)
					: (base?.(input, init) ?? new Response("{}", { status: 500 })),
			);
			const res = await post("/admin/inventory", form);
			expect(res.status).toBe(status === 500 ? 503 : status);
			expect(res.text).toContain(message);
			if (status === 409) expect(res.text).toContain("Choose a unique SKU");
		}
	});
});
