import type { BackendApi } from "../backendApi";
import type { Product } from "../models/product";

export class ProductService {
	constructor(private readonly api: BackendApi) {}

	getProducts(): Promise<Product[]> {
		return this.api.request<Product[]>("/products");
	}

	getProduct(prodId: number): Promise<Product> {
		return this.api.request<Product>(`/products/${prodId}`);
	}
}
