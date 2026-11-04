export const ORDER_STATUSES = [
	"PENDING",
	"PROCESSING",
	"SHIPPED",
	"DELIVERED",
	"CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type AdminOrderStatusError = "invalid" | "forbidden" | "failed";

export interface AdminOrderCustomer {
	id: number | string;
	name: string;
	email: string;
}

export interface AdminOrderSummary {
	orderId: number | string;
	customer: AdminOrderCustomer;
	status: string;
	orderDate: string;
	totalCost: number;
}

export interface AdminOrderPagination {
	page: number;
	pageSize: number;
	totalPages: number;
	totalOrders: number;
}

export interface AdminOrderListResponse {
	orders: AdminOrderSummary[];
	pagination?: AdminOrderPagination;
}

export interface AdminOrderListQuery {
	search?: string;
	page?: number;
}

export interface AdminOrderItem {
	productId: number | string;
	productName: string;
	quantity: number;
	unitPrice: number;
	itemTotal: number;
}

export interface AdminOrderDetails {
	orderId: number | string;
	status: string;
	orderDate: string;
	lastUpdated: string;
	customer: AdminOrderCustomer & {
		address?: {
			line1?: string;
			line2?: string;
			city?: string;
			postcode?: string;
		};
	};
	items: AdminOrderItem[];
	itemCount: number;
	orderTotal: number;
	allowedTransitions: string[];
}

export interface AdminOrderDetailsResponse {
	order: AdminOrderDetails;
}

export interface AdminOrderSummaryView extends AdminOrderSummary {
	detailsHref: string;
	displayOrderDate: string;
	displayTotal: string;
	statusLabel: string;
}

export interface AdminOrderPaginationView extends AdminOrderPagination {
	previousHref?: string | undefined;
	nextHref?: string | undefined;
}

export interface AdminOrderListView {
	orders: AdminOrderSummaryView[];
	pagination?: AdminOrderPaginationView;
}

export interface AdminOrderItemView extends AdminOrderItem {
	displayUnitPrice: string;
	displayItemTotal: string;
}

export interface AdminOrderDetailsView {
	order: Omit<AdminOrderDetails, "items"> & {
		detailsHref: string;
		statusLabel: string;
		displayOrderDate: string;
		displayLastUpdated: string;
		displayOrderTotal: string;
		addressLines: string[];
		items: AdminOrderItemView[];
		transitions: Array<{ value: string; label: string }>;
	};
	canUpdateStatus: boolean;
}
