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

export class PaymentGatewayValidationError extends Error {}

export class PaymentGatewayService {
	constructor(private readonly productService: ProductService) {}

	getProducts(): Promise<CheckoutProduct[]> {
		return this.productService.getProducts();
	}

	simulatePayment(
		selections: PaymentSelection[],
		products: CheckoutProduct[],
	): SimulatedPaymentResult {
		const productsById = new Map(
			products.map((product) => [product.prod_id, product]),
		);
		const items = selections.map(({ productId, quantity }) => {
			const product = productsById.get(productId);
			if (!product) {
				throw new PaymentGatewayValidationError(
					"Selected product is no longer available.",
				);
			}
			if (!Number.isSafeInteger(product.price) || product.price < 0) {
				throw new Error("Selected product has an invalid price.");
			}
			const subtotalInPence = product.price * quantity;
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
