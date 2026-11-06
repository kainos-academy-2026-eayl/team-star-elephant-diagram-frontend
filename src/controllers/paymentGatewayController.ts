import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { Basket } from "../services/basketService";
import type { PaymentGatewayService } from "../services/paymentGatewayService";
import type { SessionService } from "../services/sessionService";
import { basketCookieHeader } from "./basketController";

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

interface OrderFromReservationResponse {
	order: {
		orderId: number;
		orderStatus: string;
		cost: string;
		orderPlacedAt: string;
		items: Array<{ productId: number; quantity: number }>;
	};
}

export class PaymentGatewayController {
	constructor(
		private readonly paymentGatewayService: PaymentGatewayService,
		private readonly sessions: SessionService,
	) {}

	async show(req: Request, res: Response): Promise<void> {
		try {
			const cookie = basketCookieHeader(req);
			const basket = await this.sessions.request<Basket>(
				"/basket",
				req,
				res,
				cookie ? { Cookie: cookie } : {},
			);

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
			} catch (error) {
				if (error instanceof BackendApiError && error.status === 401) {
					throw error;
				}
				console.error("Failed to load saved shipping address:", error);
			}

			res.render("payment_gateway", {
				payment: null,
				error: null,
				savedAddress,
			});
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

		// If payment validation was successful and a new address was provided, update it
		if (
			outcome === "success" &&
			req.body.useExistingAddress === "false" &&
			req.body.addressLine1
		) {
			try {
				const addressData: Record<string, string> = {
					addressLine1: req.body.addressLine1,
					city: req.body.city,
					postcode: req.body.postcode,
				};
				if (req.body.addressLine2) {
					addressData.addressLine2 = req.body.addressLine2;
				}
				await this.sessions.request(
					"/profile/shipping-address",
					req,
					res,
					{},
					addressData,
					"PUT",
				);
			} catch (error) {
				console.error("Failed to update shipping address:", error);
				// Don't fail payment if address update fails, just log the error
			}
		}

		if (outcome !== "success") {
			const status = { invalid: 400, unavailable: 503 }[outcome];
			res.status(status).render("payment_gateway", data);
			return;
		}

		// Payment complete: backend deletes the reservation and records the order as PROCESSING.
		try {
			const { order } =
				await this.sessions.request<OrderFromReservationResponse>(
					"/orders/from-reservation",
					req,
					res,
					{},
					{},
					"POST",
				);
			res.status(201).render("payment_gateway", {
				error: null,
				order,
				payment: {
					status: order.orderStatus.toLowerCase(),
					message: "Payment complete. Your order is processing.",
				},
			});
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
			if (
				error instanceof BackendApiError &&
				[404, 409, 410].includes(error.status)
			) {
				res.status(409).render("payment_gateway", {
					error: error.message,
					payment: null,
					savedAddress: null,
				});
				return;
			}
			console.error("Failed to create order:", error);
			res.status(503).render("payment_gateway", {
				error: "We could not place your order. Please try again.",
				payment: null,
				savedAddress: null,
			});
		}
	}
}
