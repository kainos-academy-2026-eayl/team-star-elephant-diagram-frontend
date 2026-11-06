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
	router.post("/admin/users/:id/delete", (req, res) =>
		adminController.postDeleteUser(req, res),
	);
	router.get("/admin/baskets", (req, res) =>
		adminController.getBaskets(req, res),
	);
	router.get("/admin/baskets/:id", (req, res) =>
		adminController.getBasketDetails(req, res),
	);
	router.post("/admin/baskets", (req, res) =>
		adminController.postCreateBasket(req, res),
	);
	router.post("/admin/baskets/:id/items", (req, res) =>
		adminController.postAddBasketItem(req, res),
	);
	router.post("/admin/baskets/:id/items/:productId", (req, res) =>
		adminController.postUpdateBasketItem(req, res),
	);
	router.post("/admin/baskets/:id/items/:productId/remove", (req, res) =>
		adminController.postRemoveBasketItem(req, res),
	);
	router.post("/admin/baskets/:id/clear", (req, res) =>
		adminController.postClearBasket(req, res),
	);
	router.post("/admin/baskets/:id/delete", (req, res) =>
		adminController.postDeleteBasket(req, res),
	);
	return router;
}
