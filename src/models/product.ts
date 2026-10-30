// Mirrors the backend API contract (team-star-elephant-diagram-backend/src/models/product.ts).
// Prices are pounds as decimal numbers (e.g. 349.99), not pence.
export interface Product {
	productId: number;
	name: string;
	category: string;
	description: string;
	price: number;
	imageURL: string;
}

export interface ProductInventory {
	quantity: number;
}

export interface ExpandedProduct extends Product {
	inventory: ProductInventory | null;
}

export interface CatalogueProduct extends Product {
	formattedPrice: string;
	shortDescription: string;
}

export interface ProductDetail extends Product {
	formattedPrice: string;
	stockQuantity: number;
	inStock: boolean;
	lowStock: boolean;
	maxOrderQuantity: number;
}
