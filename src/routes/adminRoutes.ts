import { Router } from "express";
import type { AdminController } from "../controllers/adminController";

export function createAdminRoutes(adminController: AdminController): Router {
	const router = Router();

	router.get("/admin", (req, res) => adminController.getDashboard(req, res));
	router.get("/admin/users", (req, res) => adminController.getUsers(req, res));
	router.get("/admin/users/:id", (req, res) =>
		adminController.getUserDetails(req, res),
	);
	router.post("/admin/users/:id/suspend", (req, res) =>
		adminController.postSuspendUser(req, res),
	);
	router.post("/admin/users/:id/reactivate", (req, res) =>
		adminController.postReactivateUser(req, res),
	);
	router.get("/admin/baskets", (req, res) =>
		adminController.getBaskets(req, res),
	);
	router.get("/admin/baskets/:id", (req, res) =>
		adminController.getBasketDetails(req, res),
	);

	return router;
}
