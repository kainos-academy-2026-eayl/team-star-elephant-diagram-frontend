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

	router.use(["/forgot-password", "/reset-password"], (_req, res, next) => {
		res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
		next();
	});
	router.use(["/login", "/admin/login", "/logout"], (req, res, next) => {
		res.set("Cache-Control", "no-store");
		const origin = req.get("origin");
		const host = req.get("host");
		if (
			req.method === "POST" &&
			origin &&
			origin !== `https://${host}` &&
			origin !== `http://${host}`
		) {
			res.sendStatus(403);
			return;
		}
		next();
	});
	router.get("/admin/login", (req, res) =>
		authController.getLogin(req, res, true),
	);
	router.get("/login", (req, res) => authController.getLogin(req, res));
	router.get("/register", (_req, res) => authController.getRegister(res));
	router.post("/admin/login", authRateLimit, (req, res) =>
		authController.postLogin(req, res, true),
	);
	router.post("/login", authRateLimit, (req, res) =>
		authController.postLogin(req, res),
	);
	router.post("/logout", (req, res) => authController.logout(req, res));
	router.post("/register", authRateLimit, (req, res) =>
		authController.postRegister(req, res),
	);
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
