import type { Request, Response } from "express";
import type { BasketService } from "../services/basketService";
import type { CheckoutService } from "../services/checkoutService";

export class CheckoutController {
	constructor(
		private readonly checkoutService: CheckoutService,
		private readonly basketService: BasketService,
	) {}

	async show(req: Request, res: Response): Promise<void> {
		try {
			const authorization = req.get("authorization");
			const cookie = req.get("cookie");

			if (!authorization && !cookie) {
				res.status(401).render("checkout", {
					error: "Please log in to proceed to checkout.",
					loginRequired: true,
					checkout: null,
				});
				return;
			}

			const basket = await this.basketService.getBasket({
				...(authorization ? { authorization } : {}),
				...(cookie ? { cookie } : {}),
			});

			if (!basket || basket.items.length === 0) {
				res.render("checkout", {
					error: "Your basket is empty. Add some products first.",
					checkout: null,
				});
				return;
			}

			const checkoutData = await this.checkoutService.prepareCheckout(basket);
			res.render("checkout", { checkout: checkoutData, error: null });
		} catch {
			res.status(503).render("checkout", {
				error: "Checkout is temporarily unavailable. Please try again.",
				checkout: null,
			});
		}
	}
}
