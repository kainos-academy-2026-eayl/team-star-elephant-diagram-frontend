import { Router } from "express";
import type { AuthController } from "../controllers/authController";

export function createAuthRoutes(authController: AuthController): Router {
	const router = Router();

	router.get("/login", (req, res) => authController.getLogin(req, res));
	router.get("/register", (_req, res) => authController.getRegister(res));
	router.post("/login", (req, res) => authController.postLogin(req, res));
	router.post("/register", (req, res) => authController.postRegister(req, res));

	return router;
}
