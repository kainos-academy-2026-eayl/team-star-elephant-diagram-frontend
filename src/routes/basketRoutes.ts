import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { BasketController } from "../controllers/basketController";

export function createBasketRoutes(basketController: BasketController): Router {
	const router = Router();
	const basketChangeRateLimit = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 60,
		standardHeaders: "draft-8",
		legacyHeaders: false,
	});

	router.get("/basket", (req, res) => basketController.getBasket(req, res));
	router.post("/basket", basketChangeRateLimit, (req, res) =>
		basketController.addItem(req, res),
	);
	router.post("/basket/items/:productId", basketChangeRateLimit, (req, res) =>
		basketController.updateItem(req, res),
	);
	router.post(
		"/basket/items/:productId/remove",
		basketChangeRateLimit,
		(req, res) => basketController.removeItem(req, res),
	);

	return router;
}
