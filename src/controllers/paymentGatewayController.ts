import type { Request, Response } from "express";
import type { PaymentGatewayService } from "../services/paymentGatewayService";

export class PaymentGatewayController {
	constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

	async show(_req: Request, res: Response): Promise<void> {
		try {
			const products = await this.paymentGatewayService.getProducts();
			res.render("payment_gateway", { products });
		} catch {
			res.status(503).render("payment_gateway", {
				error: "Products are temporarily unavailable. Please try again.",
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
