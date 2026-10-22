import { Router } from "express";
import type { AuthController } from "../controllers/authController";

export function createAuthRoutes(authController: AuthController): Router {
	const router = Router();

	router.use(["/forgot-password", "/reset-password"], (_req, res, next) => {
		res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
		next();
	});
	router.get("/login", (req, res) => authController.getLogin(req, res));
	router.get("/register", (_req, res) => authController.getRegister(res));
	router.post("/login", (req, res) => authController.postLogin(req, res));
	router.post("/register", (req, res) => authController.postRegister(req, res));
	router.get("/forgot-password", (req, res) =>
		authController.getForgotPassword(req, res),
	);
	router.post("/forgot-password", (req, res) =>
		authController.postForgotPassword(req, res),
	);
	router.get("/reset-password", (req, res) =>
		authController.getResetPassword(req, res),
	);
	router.post("/reset-password", (req, res) =>
		authController.postResetPassword(req, res),
	);

	return router;
}
