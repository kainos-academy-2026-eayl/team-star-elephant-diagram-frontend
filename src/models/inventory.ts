export const STOCK_STATUSES = [
	"IN_STOCK",
	"LOW_STOCK",
	"OUT_OF_STOCK",
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export interface InventoryPermissions {
	view: boolean;
	create: boolean;
	update: boolean;
	delete: boolean;
}
export interface InventorySummary {
	totalProducts: number;
	lowStockProducts: number;
	outOfStockProducts: number;
}
export interface InventoryProduct {
	productId: number;
	name: string;
	description: string;
	price: string | number;
	category: string;
	sku: string;
	imageURL: string;
	stockQuantity: number;
	lowStockThreshold: number;
	stockStatus: StockStatus;
}
export interface InventoryProductView extends InventoryProduct {
	href: string;
	displayPrice: string;
	statusLabel: string;
	statusClass: string;
}
export interface InventoryAdjustment {
	id: string;
	createdAt: string;
	adjustedById: number;
	adjustedBy: { adminId: number; forename: string; surname: string };
	adjustment: number;
	reason: string;
	previousStock: number;
	newStock: number;
}
export interface InventoryPage<T> {
	items: T[];
	totalItems: number;
	totalPages: number;
	currentPage: number;
}
export interface SupplierOption {
	supplierId: number;
	name: string;
}
export interface InventoryQuery {
	search: string;
	status: string;
	sort: string;
	direction: string;
	page: number;
}
