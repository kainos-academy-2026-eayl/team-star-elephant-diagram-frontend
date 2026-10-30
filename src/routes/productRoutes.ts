import { Router } from "express";
import type { ProductController } from "../controllers/productController";

export function createProductRoutes(
	productController: ProductController,
): Router {
	const router = Router();

	router.get("/products", (req, res) =>
		productController.getProducts(req, res),
	);
	router.get("/products/:productId", (req, res) =>
		productController.getProduct(req, res),
	);

	return router;
}
