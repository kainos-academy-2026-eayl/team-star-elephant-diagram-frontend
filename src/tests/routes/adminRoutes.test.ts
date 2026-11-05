import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminController } from "../../controllers/adminController";
import { createAdminRoutes } from "../../routes/adminRoutes";

const methodNames = [
	"getDashboard",
	"getUsers",
	"getUserDetails",
	"postSuspendUser",
	"postReactivateUser",
	"getBaskets",
	"getBasketDetails",
	"getOrders",
	"getOrderDetails",
	"postOrderStatus",
] as const;

type MethodName = (typeof methodNames)[number];

function createStub() {
	const stub = Object.fromEntries(
		methodNames.map((name) => [
			name,
			vi.fn((req: Request, res: Response) => {
				res.status(200).json({ handler: name, params: req.params });
			}),
		]),
	) as Record<MethodName, ReturnType<typeof vi.fn>>;
	return stub;
}

describe("createAdminRoutes", () => {
	let stub: ReturnType<typeof createStub>;
	let app: express.Express;

	beforeEach(() => {
		stub = createStub();
		app = express();
		app.use(createAdminRoutes(stub as unknown as AdminController));
	});

	it.each<{
		method: "get" | "post";
		path: string;
		handler: MethodName;
		params: Record<string, string>;
	}>([
		{ method: "get", path: "/admin", handler: "getDashboard", params: {} },
		{ method: "get", path: "/admin/users", handler: "getUsers", params: {} },
		{
			method: "get",
			path: "/admin/users/42",
			handler: "getUserDetails",
			params: { id: "42" },
		},
		{
			method: "post",
			path: "/admin/users/42/suspend",
			handler: "postSuspendUser",
			params: { id: "42" },
		},
		{
			method: "post",
			path: "/admin/users/42/reactivate",
			handler: "postReactivateUser",
			params: { id: "42" },
		},
		{
			method: "get",
			path: "/admin/baskets",
			handler: "getBaskets",
			params: {},
		},
		{
			method: "get",
			path: "/admin/baskets/b-7",
			handler: "getBasketDetails",
			params: { id: "b-7" },
		},
		{ method: "get", path: "/admin/orders", handler: "getOrders", params: {} },
		{
			method: "get",
			path: "/admin/orders/99",
			handler: "getOrderDetails",
			params: { id: "99" },
		},
		{
			method: "post",
			path: "/admin/orders/99/status",
			handler: "postOrderStatus",
			params: { id: "99" },
		},
	])(
		"$method $path calls $handler",
		async ({ method, path, handler, params }) => {
			const response = await request(app)[method](path);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ handler, params });
			expect(stub[handler]).toHaveBeenCalledTimes(1);
			for (const name of methodNames) {
				if (name !== handler) {
					expect(stub[name]).not.toHaveBeenCalled();
				}
			}
		},
	);

	it.each([
		["post", "/admin"],
		["post", "/admin/users"],
		["get", "/admin/users/42/suspend"],
		["get", "/admin/users/42/reactivate"],
		["get", "/admin/orders/99/status"],
		["post", "/admin/baskets/1"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
		for (const name of methodNames) {
			expect(stub[name]).not.toHaveBeenCalled();
		}
	});
});
