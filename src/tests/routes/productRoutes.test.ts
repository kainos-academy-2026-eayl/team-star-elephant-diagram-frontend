import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductController } from "../../controllers/productController";
import { createProductRoutes } from "../../routes/productRoutes";

describe("createProductRoutes", () => {
	const getProducts = vi.fn((req: Request, res: Response) => {
		res.status(200).json({ handler: "getProducts", query: req.query });
	});
	const getProduct = vi.fn((req: Request, res: Response) => {
		res.status(200).json({ handler: "getProduct", params: req.params });
	});
	let app: express.Express;

	beforeEach(() => {
		getProducts.mockClear();
		getProduct.mockClear();
		app = express();
		app.use(
			createProductRoutes({
				getProducts,
				getProduct,
			} as unknown as ProductController),
		);
	});

	it("GET /products calls getProducts with the query", async () => {
		const response = await request(app).get("/products?category=Home");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			handler: "getProducts",
			query: { category: "Home" },
		});
		expect(getProducts).toHaveBeenCalledTimes(1);
		expect(getProduct).not.toHaveBeenCalled();
	});

	it("GET /products/:productId calls getProduct with the productId param", async () => {
		const response = await request(app).get("/products/17");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			handler: "getProduct",
			params: { productId: "17" },
		});
		expect(getProduct).toHaveBeenCalledTimes(1);
		expect(getProducts).not.toHaveBeenCalled();
	});

	it.each([
		["post", "/products"],
		["get", "/products/17/extra"],
		["get", "/product"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
		expect(getProducts).not.toHaveBeenCalled();
		expect(getProduct).not.toHaveBeenCalled();
	});
});
