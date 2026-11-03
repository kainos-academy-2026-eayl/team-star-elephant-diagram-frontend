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

	async prepareCheckout(basket: Basket): Promise<CheckoutData> {
		const items = basket.items.map((item) => {
			const unitPriceInPence = Math.round(item.unitPrice * 100);
			const subtotalInPence = unitPriceInPence * item.quantity;

			if (
				!Number.isFinite(item.unitPrice) ||
				item.unitPrice < 0 ||
				!Number.isSafeInteger(unitPriceInPence) ||
				!Number.isSafeInteger(subtotalInPence)
			) {
				throw new Error("Item has an invalid price.");
			}

			return {
				productId: item.productId,
				productName: item.productName,
				quantity: item.quantity,
				unitPrice: item.unitPrice,
				displayUnitPrice: this.formatPrice(unitPriceInPence),
				subtotal: subtotalInPence / 100,
				displaySubtotal: this.formatPrice(subtotalInPence),
			};
		});

		const itemCount = items.reduce((total, item) => total + item.quantity, 0);
		const subtotalInPence = items.reduce(
			(total, item) => total + Math.round(item.unitPrice * 100) * item.quantity,
			0,
		);
		const totalInPence = subtotalInPence;

		if (!Number.isSafeInteger(itemCount) || !Number.isSafeInteger(totalInPence)) {
			throw new Error("Order calculation resulted in invalid values.");
		}

		return {
			items,
			itemCount,
			subtotal: subtotalInPence / 100,
			displaySubtotal: this.formatPrice(subtotalInPence),
			total: totalInPence / 100,
			displayTotal: this.formatPrice(totalInPence),
		};
	}

	private formatPrice(amountInPence: number): string {
		return new Intl.NumberFormat("en-GB", {
			style: "currency",
			currency: "GBP",
		}).format(amountInPence / 100);
	}
}
