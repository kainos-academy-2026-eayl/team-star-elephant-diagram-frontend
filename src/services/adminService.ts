import type { BackendApi } from "../backendApi";

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
	constructor(private readonly api: BackendApi) {}

	getDashboard(authorization: string): Promise<AdminDashboard> {
		return this.api.request<AdminDashboard>("/admin", undefined, {
			Authorization: authorization,
		});
	}
}
