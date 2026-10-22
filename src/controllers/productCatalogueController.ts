import type { BackendApi } from "../backendApi";

export interface Product {
	prod_id: number;
	name: string;
	category: string;
	description: string;
	price: number;
	imageURL: string;
}

export class ProductCatalogueController {
	constructor(private readonly api: BackendApi) {}

	getProducts(): Promise<Product[]> {
		return this.api.request<Product[]>("/product_catalogue");
	}
}
