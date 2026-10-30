export interface CustomerSummary {
	name: string;
	email: string;
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
	productName: string;
	quantity: number;
	unitPrice: string;
	totalPrice: string;
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
}
