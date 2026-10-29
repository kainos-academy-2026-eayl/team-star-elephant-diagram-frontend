import type { BackendApi } from "../backendApi";
import type {
	AdminUserDetailsResponse,
	AdminUserListQuery,
	AdminUserListResponse,
	AdminUserStatusResponse,
} from "../models/adminUser";

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

const toHeaders = (
	credentials: AdminRequestCredentials,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (credentials.authorization) {
		headers.Authorization = credentials.authorization;
	}
	if (credentials.cookie) {
		headers.Cookie = credentials.cookie;
	}
	return headers;
};

const userPath = (id: string): string =>
	`/admin/users/${encodeURIComponent(id)}`;

export class AdminService {
	constructor(private readonly api: BackendApi) {}

	getDashboard(credentials: AdminRequestCredentials): Promise<AdminDashboard> {
		return this.api.request<AdminDashboard>(
			"/admin",
			undefined,
			toHeaders(credentials),
		);
	}

	getUsers(
		credentials: AdminRequestCredentials,
		query: AdminUserListQuery = {},
	): Promise<AdminUserListResponse> {
		const params = new URLSearchParams();
		if (query.search) {
			params.set("search", query.search);
		}
		if (query.page && query.page > 1) {
			params.set("page", String(query.page));
		}
		const queryString = params.toString();
		return this.api.request<AdminUserListResponse>(
			`/admin/users${queryString ? `?${queryString}` : ""}`,
			undefined,
			toHeaders(credentials),
		);
	}

	getUserById(
		credentials: AdminRequestCredentials,
		id: string,
	): Promise<AdminUserDetailsResponse> {
		return this.api.request<AdminUserDetailsResponse>(
			userPath(id),
			undefined,
			toHeaders(credentials),
		);
	}

	suspendUser(
		credentials: AdminRequestCredentials,
		id: string,
	): Promise<AdminUserStatusResponse> {
		// BackendApi sends a POST whenever a body is supplied.
		return this.api.request<AdminUserStatusResponse>(
			`${userPath(id)}/suspend`,
			{},
			toHeaders(credentials),
		);
	}

	reactivateUser(
		credentials: AdminRequestCredentials,
		id: string,
	): Promise<AdminUserStatusResponse> {
		return this.api.request<AdminUserStatusResponse>(
			`${userPath(id)}/reactivate`,
			{},
			toHeaders(credentials),
		);
	}
}
