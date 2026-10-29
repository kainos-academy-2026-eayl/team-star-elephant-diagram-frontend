import type { BackendApi } from "../backendApi";
import type {
	CatalogueProduct,
	ExpandedProduct,
	Product,
	ProductDetail,
} from "../models/product";

export const MAX_ORDER_QUANTITY = 99;
export const LOW_STOCK_THRESHOLD = 5;
export const DESCRIPTION_PREVIEW_LENGTH = 110;

const currency = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});

// The backend returns prices in pounds (e.g. 349.99), so no pence conversion.
export const formatPrice = (price: number): string =>
	currency.format(Number(price));

export const previewDescription = (
	description: string,
	maxLength = DESCRIPTION_PREVIEW_LENGTH,
): string => {
	const text = description.trim();
	if (text.length <= maxLength) {
		return text;
	}
	const cut = text.slice(0, maxLength);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/, "")}…`;
};

const safeImageURL = (url: string | undefined): string =>
	/^https?:\/\//i.test(url ?? "") ? (url as string) : "";

export class ProductService {
	constructor(private readonly api: BackendApi) {}

	async getProducts(): Promise<CatalogueProduct[]> {
		const products = await this.api.request<Product[]>("/products");
		return products.map((product) => ({
			productId: product.productId,
			name: product.name,
			category: product.category,
			description: product.description,
			price: Number(product.price),
			imageURL: safeImageURL(product.imageURL),
			formattedPrice: formatPrice(product.price),
			shortDescription: previewDescription(product.description),
		}));
	}

	async getProduct(productId: number): Promise<ProductDetail> {
		const product = await this.api.request<ExpandedProduct>(
			`/products/${productId}`,
		);
		const stockQuantity = Math.max(
			0,
			Math.trunc(Number(product.inventory?.quantity ?? 0)) || 0,
		);
		return {
			productId: product.productId,
			name: product.name,
			category: product.category,
			description: product.description,
			price: Number(product.price),
			imageURL: safeImageURL(product.imageURL),
			formattedPrice: formatPrice(product.price),
			stockQuantity,
			inStock: stockQuantity > 0,
			lowStock: stockQuantity > 0 && stockQuantity <= LOW_STOCK_THRESHOLD,
			maxOrderQuantity: Math.min(stockQuantity, MAX_ORDER_QUANTITY),
		};
	}
}
