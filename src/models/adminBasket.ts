export interface CustomerSummary {
	id?: number;
	name: string;
	email: string;
}

export interface BasketPermissions {
	view: boolean;
	create: boolean;
	update: boolean;
	delete: boolean;
}

export interface BasketSummary {
	basketId: number | string;
	customerName: string;
	customerEmail: string;
	itemCount: number;
	total: string;
	lastActivity: string;
	status: string;
}

export interface BasketSummaryView extends BasketSummary {
	detailsHref: string;
}

export interface BasketItem {
	productId?: number;
	productName: string;
	quantity: number;
	unitPrice: string;
	totalPrice: string;
	// Sellable stock from inventory; quantities above it cannot be fulfilled.
	availableStock?: number;
	maxQuantity?: number;
	exceedsStock?: boolean;
}

// In-stock product an admin can add to the basket.
export interface BasketProductOption {
	productId: number;
	name: string;
	unitPrice: string;
	availableStock: number;
	maxQuantity: number;
}

export interface BasketDetails {
	basketId: number | string;
	createdAt: string;
	lastActivity: string;
	status: string;
	customer: CustomerSummary;
	items: BasketItem[];
	itemCount: number;
	total: string;
}

export interface BasketListResponse {
	baskets: BasketSummary[];
}

export interface BasketDetailsResponse {
	basket: BasketDetails;
	products?: BasketProductOption[];
}

export interface BasketPage {
	basket: BasketDetails;
	products: BasketProductOption[];
}

export type BasketAction = "add" | "update" | "remove" | "clear" | "delete";
