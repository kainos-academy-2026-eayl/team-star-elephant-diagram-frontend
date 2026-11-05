import { Router } from "express";
import type { AdminController } from "../controllers/adminController";
import { createRateLimiter } from "../middleware/rateLimiter";

export function createAdminRoutes(adminController: AdminController): Router {
	const router = Router();
	const orderRateLimit = createRateLimiter(60);

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
	router.get("/admin/orders", orderRateLimit, (req, res) =>
		adminController.getOrders(req, res),
	);
	router.get("/admin/orders/:id", orderRateLimit, (req, res) =>
		adminController.getOrderDetails(req, res),
	);
	router.post("/admin/orders/:id/status", orderRateLimit, (req, res) =>
		adminController.postOrderStatus(req, res),
	);

	return router;
}
