import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { BasketService } from "../services/basketService";

const formatPrice = (amount: number): string =>
	new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: "GBP",
	}).format(amount);

export class BasketController {
	constructor(private readonly basketService: BasketService) {}

	async getBasket(req: Request, res: Response): Promise<void> {
		try {
			const basket = await this.basketService.getBasket(req, res);
			const items = basket.items.map((item) => ({
				...item,
				imageURL: /^https?:\/\//i.test(item.imageURL ?? "")
					? item.imageURL
					: "",
				displayUnitPrice: formatPrice(item.unitPrice),
				displaySubtotal: formatPrice(item.unitPrice * item.quantity),
			}));
			res.render("basket", {
				basket: {
					items,
					itemCount: items.reduce((count, item) => count + item.quantity, 0),
					displaySubtotal: formatPrice(basket.subtotal),
				},
			});
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401) {
				res.status(401).render("basket", {
					error: "Please log in to view your basket.",
					loginRequired: true,
					basket: { items: [], itemCount: 0, displaySubtotal: formatPrice(0) },
				});
				return;
			}
			res.status(503).render("basket", {
				error: "Your basket is temporarily unavailable. Please try again.",
				basket: { items: [], itemCount: 0, displaySubtotal: formatPrice(0) },
			});
		}
	}
}
