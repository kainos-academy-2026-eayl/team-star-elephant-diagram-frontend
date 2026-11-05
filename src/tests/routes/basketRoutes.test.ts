import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BasketController } from "../../controllers/basketController";
import { createBasketRoutes } from "../../routes/basketRoutes";

function createStub() {
	const handle = (name: string) =>
		vi.fn((req: Request, res: Response) => {
			res.status(200).json({ handler: name, params: req.params });
		});
	return {
		getBasket: handle("getBasket"),
		addItem: handle("addItem"),
		updateItem: handle("updateItem"),
		removeItem: handle("removeItem"),
	};
}

describe("createBasketRoutes", () => {
	let stub: ReturnType<typeof createStub>;
	let app: express.Express;

	beforeEach(() => {
		stub = createStub();
		app = express();
		app.use(createBasketRoutes(stub as unknown as BasketController));
	});

	it.each([
		{ method: "get", path: "/basket", handler: "getBasket", params: {} },
		{ method: "post", path: "/basket", handler: "addItem", params: {} },
		{
			method: "post",
			path: "/basket/items/12",
			handler: "updateItem",
			params: { productId: "12" },
		},
		{
			method: "post",
			path: "/basket/items/12/remove",
			handler: "removeItem",
			params: { productId: "12" },
		},
	] as const)(
		"$method $path calls $handler",
		async ({ method, path, handler, params }) => {
			const response = await request(app)[method](path);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ handler, params });
			expect(stub[handler]).toHaveBeenCalledTimes(1);
		},
	);

	it.each([
		["get", "/basket/items/12"],
		["get", "/basket/items/12/remove"],
		["delete", "/basket"],
		["post", "/basket/items"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
	});

	it("sends draft-8 rate limit headers on basket changes only", async () => {
		const change = await request(app).post("/basket");
		const view = await request(app).get("/basket");

		expect(change.headers.ratelimit).toBeDefined();
		expect(change.headers["x-ratelimit-limit"]).toBeUndefined();
		expect(view.headers.ratelimit).toBeUndefined();
	});

	it("returns 429 after 60 basket changes shared across add, update and remove", async () => {
		const paths = ["/basket", "/basket/items/1", "/basket/items/1/remove"];
		for (let i = 0; i < 60; i++) {
			const response = await request(app).post(paths[i % 3] ?? "/basket");
			expect(response.status).toBe(200);
		}

		expect((await request(app).post("/basket/items/1")).status).toBe(429);
		expect((await request(app).get("/basket")).status).toBe(200);
		expect(stub.updateItem).toHaveBeenCalledTimes(20);
	});
});
