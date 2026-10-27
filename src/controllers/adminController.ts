import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AdminService } from "../services/adminService";

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(req: Request, res: Response): Promise<void> {
		const authorization = req.get("authorization");
		const cookie = req.get("cookie");
		const credentials = {
			...(authorization && /^Bearer\s+\S+$/i.test(authorization)
				? { authorization }
				: {}),
			...(cookie ? { cookie } : {}),
		};
		if (!credentials.authorization && !credentials.cookie) {
			res.sendStatus(401);
			return;
		}

		try {
			const dashboard = await this.adminService.getDashboard(credentials);
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
