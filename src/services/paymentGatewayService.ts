import type { ProductService } from "./productService";

type PaymentSelection = { productId: number; quantity: number };
type CheckoutProduct = Awaited<
	ReturnType<ProductService["getProducts"]>
>[number];

export interface SimulatedPaymentResult {
	items: Array<{
		name: string;
		quantity: number;
		formattedSubtotal: string;
	}>;
	itemCount: number;
	formattedTotal: string;
}

type PaymentSubmissionResult =
	| { outcome: "success"; paymentResult: SimulatedPaymentResult }
	| { outcome: "invalid"; products: CheckoutProduct[]; error: string }
	| { outcome: "unavailable"; error: string };

class PaymentGatewayValidationError extends Error {}

export class PaymentGatewayService {
	constructor(private readonly productService: ProductService) {}

	getProducts(): Promise<CheckoutProduct[]> {
		return this.productService.getProducts();
	}

	async submit(body: unknown): Promise<PaymentSubmissionResult> {
		let products: CheckoutProduct[];
		try {
			products = await this.getProducts();
		} catch {
			return {
				outcome: "unavailable",
				error: "Products are temporarily unavailable. Please try again.",
			};
		}

		const selections = this.parsePaymentSelection(body);
		if (!selections) {
			return {
				outcome: "invalid",
				products,
				error: "Select at least one product and enter a valid quantity.",
			};
		}

		try {
			return {
				outcome: "success",
				paymentResult: this.simulatePayment(selections, products),
			};
		} catch (error) {
			if (error instanceof PaymentGatewayValidationError) {
				return { outcome: "invalid", products, error: error.message };
			}
			return {
				outcome: "unavailable",
				error: "Checkout is temporarily unavailable. Please try again.",
			};
		}
	}

	private getRepeatedFields(value: unknown): string[] | null {
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

	private parsePaymentSelection(body: unknown): PaymentSelection[] | null {
		if (
			!body ||
			typeof body !== "object" ||
			!("productId" in body) ||
			!("quantity" in body)
		) {
			return null;
		}
		const productIds = this.getRepeatedFields(body.productId);
		const quantities = this.getRepeatedFields(body.quantity);
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

	private simulatePayment(
		selections: PaymentSelection[],
		products: CheckoutProduct[],
	): SimulatedPaymentResult {
		const productsById = new Map(
			products.map((product) => [product.productId, product]),
		);
		const items = selections.map(({ productId, quantity }) => {
			const product = productsById.get(productId);
			if (!product) {
				throw new PaymentGatewayValidationError(
					"Selected product is no longer available.",
				);
			}
			const unitPriceInPence = Math.round(product.price * 100);
			if (
				!Number.isFinite(product.price) ||
				product.price < 0 ||
				!Number.isSafeInteger(unitPriceInPence)
			) {
				throw new Error("Selected product has an invalid price.");
			}
			const subtotalInPence = unitPriceInPence * quantity;
			if (!Number.isSafeInteger(subtotalInPence)) {
				throw new Error("Order total is too large.");
			}

			return {
				name: product.name,
				quantity,
				subtotalInPence,
				formattedSubtotal: this.formatPrice(subtotalInPence),
			};
		});
		const itemCount = items.reduce((total, item) => total + item.quantity, 0);
		if (!Number.isSafeInteger(itemCount)) {
			throw new Error("Order quantity is too large.");
		}
		const totalInPence = items.reduce(
			(total, item) => total + item.subtotalInPence,
			0,
		);
		if (!Number.isSafeInteger(totalInPence)) {
			throw new Error("Order total is too large.");
		}

		return {
			items: items.map(({ name, quantity, formattedSubtotal }) => ({
				name,
				quantity,
				formattedSubtotal,
			})),
			itemCount,
			formattedTotal: this.formatPrice(totalInPence),
		};
	}

	private formatPrice(amountInPence: number): string {
		return new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency: "GBP",
		}).format(amountInPence / 100);
	}
}
