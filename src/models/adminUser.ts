export type AdminUserStatus = "active" | "suspended";

export interface AdminUserSummary {
	id: number | string;
	name: string;
	email: string;
	registeredAt: string;
	status: AdminUserStatus | string;
}

export interface AdminUserPagination {
	page: number;
	pageSize: number;
	totalPages: number;
	totalUsers: number;
}

export interface AdminUserListResponse {
	users: AdminUserSummary[];
	pagination?: AdminUserPagination;
}

export interface AdminUserListQuery {
	search?: string;
	page?: number;
}

export interface AdminUserOrder {
	id: number | string;
	placedAt: string;
	status: string;
	total: number;
}

export interface AdminUserBasket {
	itemCount: number;
	subtotal: number;
	items: Array<{
		productName: string;
		quantity: number;
	}>;
}

export interface AdminUserDetailsResponse {
	user: AdminUserSummary;
	recentOrders: AdminUserOrder[];
	basket: AdminUserBasket;
}

export interface AdminUserStatusResponse {
	user: Pick<AdminUserSummary, "id" | "status">;
}
