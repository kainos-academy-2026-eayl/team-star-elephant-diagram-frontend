import type { BackendApi } from "../backendApi";

export interface BasketRequestCredentials {
	authorization?: string;
	cookie?: string;
}

// Mirrors the backend API contract (team-star-elephant-diagram-backend/src/models/basket.ts).
export interface BasketItem {
	productId: number;
	productName: string;
	quantity: number;
	unitPrice: number;
	imageURL?: string;
}

export interface Basket {
	items: BasketItem[];
	subtotal: number;
}

const toHeaders = (
	credentials: BasketRequestCredentials,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (credentials.authorization) {
		headers.Authorization = credentials.authorization;
	}
	if (credentials.cookie) {
		headers.Cookie = credentials.cookie;
	}
	return headers;
};

export class BasketService {
	constructor(private readonly api: BackendApi) {}

	getBasket(credentials: BasketRequestCredentials): Promise<Basket> {
		return this.api.request<Basket>(
			"/basket",
			undefined,
			toHeaders(credentials),
		);
	}

	async addItem(
		productId: number,
		quantity: number,
		credentials: BasketRequestCredentials,
	): Promise<{ basket: Basket; cookies: string[] }> {
		const { result, cookies } = await this.api.requestWithResponse<Basket>(
			"/basket",
			{ productId, quantity },
			toHeaders(credentials),
		);
		return { basket: result, cookies };
	}
}
