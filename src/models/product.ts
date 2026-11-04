// Mirrors the backend API contract (team-star-elephant-diagram-backend/src/models/product.ts).
// Prices are in pounds as decimal numbers (e.g. 349.99).
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

export interface ProductImage {
	url: string;
	altText: string | null;
}

export interface ExpandedProduct extends Product {
	inventory: ProductInventory | null;
	images?: ProductImage[];
}

export interface CatalogueProduct extends Product {
	formattedPrice: string;
	shortDescription: string;
}

export interface ProductDetail extends Product {
	formattedPrice: string;
	images: ProductImage[];
	stockQuantity: number;
	inStock: boolean;
	lowStock: boolean;
	maxOrderQuantity: number;
}
