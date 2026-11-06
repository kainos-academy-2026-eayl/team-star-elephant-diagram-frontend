import { Router } from "express";
import type { BasketController } from "../controllers/basketController";
import { createRateLimiter } from "../middleware/rateLimiter";
import { rateLimitMax } from "./rateLimitMax";

export function createBasketRoutes(basketController: BasketController): Router {
	const router = Router();
	const mutationRateLimit = createRateLimiter(rateLimitMax(60));

	router.get("/basket", (req, res) => basketController.getBasket(req, res));
	router.post("/basket", mutationRateLimit, (req, res) =>
		basketController.addItem(req, res),
	);
	router.post("/basket/items/:productId", mutationRateLimit, (req, res) =>
		basketController.updateItem(req, res),
	);
	router.post(
		"/basket/items/:productId/remove",
		mutationRateLimit,
		(req, res) => basketController.removeItem(req, res),
	);

	return router;
}
