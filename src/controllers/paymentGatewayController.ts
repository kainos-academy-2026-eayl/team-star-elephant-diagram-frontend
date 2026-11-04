import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { BasketService } from "../services/basketService";
import type { PaymentGatewayService } from "../services/paymentGatewayService";
import type { SessionService } from "../services/sessionService";

export interface UserProfile {
	user: {
		userId: number;
		firstName: string;
		lastName: string;
		email: string;
		memberSince: string;
		addressLine1: string;
		addressLine2: string;
		city: string;
		postcode: string;
	};
}

export class PaymentGatewayController {
	constructor(
		private readonly paymentGatewayService: PaymentGatewayService,
		private readonly basketService: BasketService,
		private readonly sessions: SessionService,
	) {}

	async show(req: Request, res: Response): Promise<void> {
		try {
			const authorization = req.get("authorization");

			if (!authorization) {
				res.status(401).render("payment_gateway", {
					error: "Please log in to complete payment.",
					loginRequired: true,
					payment: null,
					savedAddress: null,
				});
				return;
			}

			const basket = await this.basketService.getBasket({
				authorization,
			});

			if (!basket || basket.items.length === 0) {
				res.status(400).render("payment_gateway", {
					error:
						"Your basket is empty. Please add items before proceeding to payment.",
					payment: null,
					savedAddress: null,
				});
				return;
			}

			let savedAddress: UserProfile | null = null;
			try {
				savedAddress = await this.sessions.request<UserProfile>(
					"/profile",
					req,
					res,
					{},
				);
			} catch {
				// If profile fetch fails, continue without saved address
			}

			res.render("payment_gateway", { payment: null, error: null, savedAddress });
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401) {
				res.status(401).render("payment_gateway", {
					error: "Please log in to complete payment.",
					loginRequired: true,
					payment: null,
					savedAddress: null,
				});
				return;
			}
			res.status(503).render("payment_gateway", {
				error: "Payment gateway is temporarily unavailable. Please try again.",
				payment: null,
				savedAddress: null,
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
