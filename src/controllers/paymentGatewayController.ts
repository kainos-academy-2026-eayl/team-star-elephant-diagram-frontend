import type { Request, Response } from "express";
import {
	type PaymentGatewayService,
	PaymentGatewayValidationError,
} from "../services/paymentGatewayService";

type PaymentSelection = { productId: number; quantity: number };

function getRepeatedFields(value: unknown): string[] | null {
	if (typeof value === "string") {
		return [value];
	}
	if (
		Array.isArray(value) &&
		value.every((item): item is string => typeof item === "string")
	) {
		return value;
	}
	return null;
}

function parsePaymentSelection(body: unknown): PaymentSelection[] | null {
	if (!body || typeof body !== "object") {
		return null;
	}
	const form = body as Record<string, unknown>;
	const productIds = getRepeatedFields(form.productId);
	const quantities = getRepeatedFields(form.quantity);
	if (
		!productIds ||
		!quantities ||
		productIds.length !== quantities.length ||
		productIds.length === 0
	) {
		return null;
	}

	const selections: PaymentSelection[] = [];
	const seenProductIds = new Set<number>();
	for (const [index, productIdValue] of productIds.entries()) {
		if (!/^[1-9]\d*$/.test(productIdValue)) {
			return null;
		}
		const productId = Number(productIdValue);
		const quantityValue = quantities[index];
		if (
			!Number.isSafeInteger(productId) ||
			seenProductIds.has(productId) ||
			quantityValue === undefined ||
			!/^(?:0|[1-9]\d*)$/.test(quantityValue)
		) {
			return null;
		}
		const quantity = Number(quantityValue);
		if (!Number.isSafeInteger(quantity) || quantity > 99) {
			return null;
		}
		seenProductIds.add(productId);
		if (quantity > 0) {
			selections.push({ productId, quantity });
		}
	}

	return selections.length > 0 ? selections : null;
}

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
		const selections = parsePaymentSelection(req.body);
		if (!selections) {
			await this.renderFormError(
				res,
				"Select at least one product and enter a valid quantity.",
			);
			return;
		}

		let products: Awaited<ReturnType<PaymentGatewayService["getProducts"]>>;
		try {
			products = await this.paymentGatewayService.getProducts();
		} catch {
			res.status(503).render("payment_gateway", {
				error: "Products are temporarily unavailable. Please try again.",
			});
			return;
		}

		try {
			const result = this.paymentGatewayService.simulatePayment(
				selections,
				products,
			);
			res.render("payment_gateway", { paymentResult: result });
		} catch (error) {
			if (error instanceof PaymentGatewayValidationError) {
				res.status(400).render("payment_gateway", {
					products,
					error: error.message,
				});
				return;
			}
			res.status(503).render("payment_gateway", {
				error: "Checkout is temporarily unavailable. Please try again.",
			});
		}
	}

	private async renderFormError(res: Response, error: string): Promise<void> {
		try {
			const products = await this.paymentGatewayService.getProducts();
			res.status(400).render("payment_gateway", { products, error });
		} catch {
			res.status(503).render("payment_gateway", {
				error: "Products are temporarily unavailable. Please try again.",
			});
		}
	}
}
