import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthController } from "../controllers/authController";

export function createAuthRoutes(authController: AuthController): Router {
	const router = Router();
	const authRateLimit = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 10,
		standardHeaders: "draft-8",
		legacyHeaders: false,
	});

	router.get("/login", (req, res) => authController.getLogin(req, res));
	router.get("/register", (_req, res) => authController.getRegister(res));
	router.post("/login", authRateLimit, (req, res) =>
		authController.postLogin(req, res),
	);
	router.post("/register", authRateLimit, (req, res) =>
		authController.postRegister(req, res),
	);

	return router;
}
