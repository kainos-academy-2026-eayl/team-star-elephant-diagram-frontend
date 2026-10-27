import type { BackendApi } from "../backendApi";

export interface Basket {
	items: Array<{
		id: number | string;
		productName: string;
		quantity: number;
		unitPrice: number;
		imageURL?: string;
	}>;
	subtotal: number;
}

export class BasketService {
	constructor(private readonly api: BackendApi) {}

	getBasket(): Promise<Basket> {
		return this.api.request<Basket>("/basket");
	}
}
