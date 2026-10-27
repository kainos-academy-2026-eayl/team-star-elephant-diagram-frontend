import { Router } from "express";
import type { AdminController } from "../controllers/adminController";

export function createAdminRoutes(adminController: AdminController): Router {
	const router = Router();

	router.get("/admin", (req, res) => adminController.getDashboard(req, res));

	return router;
}
