import type { Request, Response } from "express";
import type { SessionService } from "./sessionService";

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
	constructor(private readonly sessions: SessionService) {}

	getBasket(req: Request, res: Response): Promise<Basket> {
		return this.sessions.request<Basket>("/basket", req, res);
	}
}
