import { Router } from "express";
import type { InventoryController } from "../controllers/inventoryController";
import { createRateLimiter } from "../middleware/rateLimiter";

export function createInventoryRoutes(controller: InventoryController): Router {
	const router = Router();
	router.use("/admin/inventory", createRateLimiter(60));
	router.get("/admin/inventory", controller.list);
	router.get("/admin/inventory/new", controller.createForm);
	router.post("/admin/inventory", controller.create);
	router.get("/admin/inventory/:id/edit", controller.editForm);
	router.get("/admin/inventory/:id", controller.details);
	router.post("/admin/inventory/:id", controller.update);
	router.post("/admin/inventory/:id/delete", controller.delete);
	router.post("/admin/inventory/:id/stock", controller.adjust);
	router.post("/admin/inventory/:id/threshold", controller.threshold);
	return router;
}
