import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AdminService } from "../services/adminService";

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(req: Request, res: Response): Promise<void> {
		const authorization = req.get("authorization");
		if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
			res.sendStatus(401);
			return;
		}

		try {
			const dashboard = await this.adminService.getDashboard(authorization);
			res.render("admin", dashboard);
		} catch (error) {
			if (
				error instanceof BackendApiError &&
				[401, 403].includes(error.status)
			) {
				res.sendStatus(error.status);
				return;
			}
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
