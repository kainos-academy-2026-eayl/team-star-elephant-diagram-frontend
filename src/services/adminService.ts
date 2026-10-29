import type { Request, Response } from "express";
import type { SessionService } from "./sessionService";

export interface AdminDashboard {
	staff: { name: string };
	sections: Array<{ label: string }>;
	quickActions: Array<{ label: string }>;
	cards: Array<{ label: string; value: string }>;
	recentOrders: Array<{
		id: number | string;
		customer: string;
		date: string;
		status: string;
	}>;
	newUsers: Array<{ name: string; email: string; joined: string }>;
	stockChanges: Array<{
		product: string;
		amount: string;
		reason: string;
	}>;
}

export class AdminService {
	constructor(private readonly sessions: SessionService) {}

	getDashboard(req: Request, res: Response): Promise<AdminDashboard> {
		return this.sessions.request<AdminDashboard>("/admin", req, res);
	}
}
