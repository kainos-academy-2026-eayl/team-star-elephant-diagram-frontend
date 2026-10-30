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

export type AdminUserStatusAction = "suspend" | "reactivate";

export type AdminUserStatusUpdate = "suspended" | "reactivated";

export interface AdminUserView extends AdminUserSummary {
	detailsHref: string;
	displayRegisteredAt: string;
	statusLabel: "Active" | "Suspended";
	isSuspended: boolean;
}

export interface AdminUserOrderView extends AdminUserOrder {
	displayPlacedAt: string;
	displayTotal: string;
}

export interface AdminUserBasketView {
	itemCount: number;
	items: AdminUserBasket["items"];
	displaySubtotal: string;
}

export interface AdminUserPaginationView extends AdminUserPagination {
	previousHref?: string | undefined;
	nextHref?: string | undefined;
}

export interface AdminUserListView {
	users: AdminUserView[];
	pagination?: AdminUserPaginationView;
}

export interface AdminUserDetailsView {
	user: AdminUserView;
	recentOrders: AdminUserOrderView[];
	basket: AdminUserBasketView;
}
