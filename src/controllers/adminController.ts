import type { Request, Response } from "express";
import type { AdminService } from "../services/adminService";

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(_req: Request, res: Response): Promise<void> {
		try {
			const dashboard = await this.adminService.getDashboard();
			res.render("admin", dashboard);
		} catch {
			res.status(503).render("admin", {
				error: "Admin data is temporarily unavailable. Please try again.",
				staff: { name: "" },
				sections: [],
				quickActions: [],
				cards: [],
				recentOrders: [],
				newUsers: [],
				stockChanges: [],
			});
		}
	}
}
