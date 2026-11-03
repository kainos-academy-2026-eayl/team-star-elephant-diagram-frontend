import type { Request, Response } from "express";
import type { BasketService } from "../services/basketService";
import type { PaymentGatewayService } from "../services/paymentGatewayService";

export class PaymentGatewayController {
	constructor(
		private readonly paymentGatewayService: PaymentGatewayService,
		private readonly basketService: BasketService,
	) {}

	async show(req: Request, res: Response): Promise<void> {
		try {
			const authorization = req.get("authorization");
			const cookie = req.get("cookie");

			if (!authorization && !cookie) {
				res.status(401).render("payment_gateway", {
					error: "Please log in to complete payment.",
					loginRequired: true,
					payment: null,
				});
				return;
			}

			const basket = await this.basketService.getBasket({
				...(authorization ? { authorization } : {}),
				...(cookie ? { cookie } : {}),
			});

			if (!basket || basket.items.length === 0) {
				res.status(400).render("payment_gateway", {
					error: "Your basket is empty. Please add items before proceeding to payment.",
					payment: null,
				});
				return;
			}

			res.render("payment_gateway", { payment: null, error: null });
		} catch {
			res.status(503).render("payment_gateway", {
				error: "Payment gateway is temporarily unavailable. Please try again.",
				payment: null,
			});
		}
	}

	async submit(req: Request, res: Response): Promise<void> {
		const { outcome, ...data } = await this.paymentGatewayService.submit(
			req.body,
		);
		const status = { success: 200, invalid: 400, unavailable: 503 }[outcome];
		res.status(status).render("payment_gateway", data);
	}
}
