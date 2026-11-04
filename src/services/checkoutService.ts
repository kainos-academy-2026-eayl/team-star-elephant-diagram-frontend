export interface CheckoutData {
	items: Array<{
		productId: number;
		productName: string;
		quantity: number;
		unitPrice: number;
		displayUnitPrice: string;
		subtotal: number;
		displaySubtotal: string;
	}>;
	itemCount: number;
	subtotal: number;
	displaySubtotal: string;
	shippingFee: number;
	displayShippingFee: string;
	total: number;
	displayTotal: string;
}

export interface BasketItem {
	productId: number;
	productName: string;
	quantity: number;
	unitPrice: number;
	imageURL?: string;
}

export interface Basket {
	items: BasketItem[];
	subtotal: number;
}

export class CheckoutService {
	constructor() {}

	private calculateShippingFee(subtotal: number): number {
		return subtotal > 200 ? 30 : 20;
	}

	async prepareCheckout(basket: Basket): Promise<CheckoutData> {
		const items = basket.items.map((item) => {
			const subtotal = item.unitPrice * item.quantity;

			if (
				!Number.isFinite(item.unitPrice) ||
				item.unitPrice < 0 ||
				!Number.isFinite(subtotal)
			) {
				throw new Error("Item has an invalid price.");
			}

			return {
				productId: item.productId,
				productName: item.productName,
				quantity: item.quantity,
				unitPrice: item.unitPrice,
				displayUnitPrice: this.formatPrice(item.unitPrice),
				subtotal,
				displaySubtotal: this.formatPrice(subtotal),
			};
		});

		const itemCount = items.reduce((total, item) => total + item.quantity, 0);
		const subtotal = items.reduce((total, item) => total + item.subtotal, 0);
		const shippingFee = this.calculateShippingFee(subtotal);
		const total = subtotal + shippingFee;

		if (!Number.isFinite(itemCount) || !Number.isFinite(total)) {
			throw new Error("Order calculation resulted in invalid values.");
		}

		return {
			items,
			itemCount,
			subtotal,
			displaySubtotal: this.formatPrice(subtotal),
			shippingFee,
			displayShippingFee: this.formatPrice(shippingFee),
			total,
			displayTotal: this.formatPrice(total),
		};
	}

	private formatPrice(amountInPounds: number): string {
		return new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency: "GBP",
		}).format(amountInPounds);
	}
}
