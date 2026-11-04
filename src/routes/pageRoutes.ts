import { Router } from "express";
import type { PageController } from "../controllers/pageController";

export function createPageRoutes(pageController: PageController): Router {
	const router = Router();

	router.get("/health", (_req, res) => pageController.health(res));
	router.get("/", (req, res) => pageController.home(req, res));

	return router;
}
