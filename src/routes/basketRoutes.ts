import { Router } from "express";
import type { BasketController } from "../controllers/basketController";

export function createBasketRoutes(basketController: BasketController): Router {
	const router = Router();

	router.get("/basket", (req, res) => basketController.getBasket(req, res));
	router.post("/basket", (req, res) => basketController.addItem(req, res));
	router.post("/basket/items/:productId", (req, res) =>
		basketController.updateItem(req, res),
	);
	router.post("/basket/items/:productId/remove", (req, res) =>
		basketController.removeItem(req, res),
	);

	return router;
}
