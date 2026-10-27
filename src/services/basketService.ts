import type { BackendApi } from "../backendApi";

export interface BasketRequestCredentials {
    authorization?: string;
    cookie?: string;
}

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
    constructor(private readonly api: BackendApi) { }

    getBasket(credentials: BasketRequestCredentials): Promise<Basket> {
        const headers: Record<string, string> = {};
        if (credentials.authorization) {
            headers.Authorization = credentials.authorization;
        }
        if (credentials.cookie) {
            headers.Cookie = credentials.cookie;
        }
        return this.api.request<Basket>("/basket", undefined, headers);
    }
}
