import { Router } from "express";
import type { CheckoutController } from "../controllers/checkoutController";

export function createCheckoutRoutes(
	checkoutController: CheckoutController,
): Router {
	const router = Router();

	router.get("/checkout", (req, res) =>
		checkoutController.show(req, res),
	);

	return router;
}
