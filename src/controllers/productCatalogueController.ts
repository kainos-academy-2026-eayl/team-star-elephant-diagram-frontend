import type { BackendApi } from "../backendApi";
import type { Product } from "../models/product";

export class ProductCatalogueController {
	constructor(private readonly api: BackendApi) {}

	getProducts(): Promise<Product[]> {
		return this.api.request<Product[]>("/product_catalogue");
	}
}
