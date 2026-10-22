import { Router } from "express";
import type { PageController } from "../controllers/pageController";

export function createPageRoutes(pageController: PageController): Router {
	const router = Router();

	router.get("/health", (_req, res) => pageController.health(res));
	router.get("/", (_req, res) => pageController.home(res));
	router.get("/profile", (_req, res) => pageController.profile(res));

	return router;
}
