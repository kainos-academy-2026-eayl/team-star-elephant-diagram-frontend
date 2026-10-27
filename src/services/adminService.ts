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

export interface AdminRequestCredentials {
	authorization?: string;
	cookie?: string;
}

export class AdminService {
	constructor(private readonly api: BackendApi) {}

	getDashboard(credentials: AdminRequestCredentials): Promise<AdminDashboard> {
		const headers: Record<string, string> = {};
		if (credentials.authorization) {
			headers.Authorization = credentials.authorization;
		}
		if (credentials.cookie) {
			headers.Cookie = credentials.cookie;
		}
		return this.api.request<AdminDashboard>("/admin", undefined, {
			...headers,
		});
	}
}
