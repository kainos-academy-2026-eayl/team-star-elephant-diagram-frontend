import { Router } from "express";
import type { ProductExpandedController } from "../controllers/ProductExpandedController";

export function createProductExpandedRoutes(productExpandedController: ProductExpandedController): Router {
	const router = Router();

	router.get("/products/:id", (req, res) =>
		productExpandedController.getProductExpanded(req, res),
	);

	return router;
}
