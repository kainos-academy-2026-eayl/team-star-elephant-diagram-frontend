import type { Request, Response } from "express";
import type {
	BasketRequestCredentials,
	BasketService,
} from "../services/basketService";
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
			const credentials: BasketRequestCredentials = {
				...(authorization ? { authorization } : {}),
				...(cookie ? { cookie } : {}),
			};

			let hasItems = false;
			if (authorization || cookie) {
				const basket = await this.basketService.getBasket(credentials);
				hasItems = basket && basket.items.length > 0;
			}

			res.render("payment_gateway", { hasItems });
		} catch {
			res.status(503).render("payment_gateway", {
				error: "Basket is temporarily unavailable. Please try again.",
				hasItems: false,
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
