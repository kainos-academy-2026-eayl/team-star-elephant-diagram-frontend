import type { BackendApi } from "../backendApi";
import type { Product } from "../models/product";

type FormattedProduct = Product & { formattedPrice: string };

export class ProductExpandedService {
	constructor(private readonly api: BackendApi) {}

	async getProductExpanded(productId: string): Promise<FormattedProduct> {
		const product = await this.api.request<Product>(
			`/products/${encodeURIComponent(productId)}`,
		);
		return this.formatProduct(product);
	}

	private formatProduct(product: Product): FormattedProduct {
		return {
			...product,
			formattedPrice: new Intl.NumberFormat("en-GB", {
				style: "currency",
				currency: "GBP",
			}).format(product.price / 100),
			imageURL: /^https?:\/\//i.test(product.imageURL) ? product.imageURL : "",
		};
	}
}
