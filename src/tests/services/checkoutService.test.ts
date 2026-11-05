import { describe, expect, it } from "vitest";
import {
	type BasketItem,
	CheckoutService,
} from "../../services/checkoutService";

const item = (overrides: Partial<BasketItem> = {}): BasketItem => ({
	productId: 1,
	productName: "Kettle",
	quantity: 1,
	unitPrice: 10,
	...overrides,
});

describe("CheckoutService", () => {
	const service = new CheckoutService();

	it("calculates line subtotals, item count and formatted totals", async () => {
		const result = await service.prepareCheckout({
			items: [
				item({
					productId: 1,
					productName: "Kettle",
					quantity: 2,
					unitPrice: 12.5,
				}),
				item({
					productId: 2,
					productName: "Toaster",
					quantity: 1,
					unitPrice: 1234.5,
					imageURL: "/images/toaster.png",
				}),
			],
			subtotal: 0,
		});

		expect(result).toEqual({
			items: [
				{
					productId: 1,
					productName: "Kettle",
					quantity: 2,
					unitPrice: 12.5,
					displayUnitPrice: "£12.50",
					subtotal: 25,
					displaySubtotal: "£25.00",
				},
				{
					productId: 2,
					productName: "Toaster",
					quantity: 1,
					unitPrice: 1234.5,
					displayUnitPrice: "£1,234.50",
					subtotal: 1234.5,
					displaySubtotal: "£1,234.50",
				},
			],
			itemCount: 3,
			subtotal: 1259.5,
			displaySubtotal: "£1,259.50",
			shippingFee: 30,
			displayShippingFee: "£30.00",
			total: 1289.5,
			displayTotal: "£1,289.50",
		});
	});

	it("recalculates totals rather than trusting the basket subtotal", async () => {
		const result = await service.prepareCheckout({
			items: [item({ quantity: 3, unitPrice: 2 })],
			subtotal: 999,
		});

		expect(result.subtotal).toBe(6);
		expect(result.shippingFee).toBe(20);
		expect(result.total).toBe(26);
	});

	it("returns zero totals for an empty basket", async () => {
		await expect(
			service.prepareCheckout({ items: [], subtotal: 0 }),
		).resolves.toEqual({
			items: [],
			itemCount: 0,
			subtotal: 0,
			displaySubtotal: "£0.00",
			shippingFee: 0,
			displayShippingFee: "£0.00",
			total: 0,
			displayTotal: "£0.00",
		});
	});

	it("allows free items", async () => {
		const result = await service.prepareCheckout({
			items: [item({ unitPrice: 0, quantity: 2 })],
			subtotal: 0,
		});

		expect(result.items[0]?.displayUnitPrice).toBe("£0.00");
		expect(result.itemCount).toBe(2);
	});

	it.each([
		["negative", { unitPrice: -1 }],
		["NaN", { unitPrice: Number.NaN }],
		["infinite", { unitPrice: Number.POSITIVE_INFINITY }],
		["overflowing subtotal", { unitPrice: Number.MAX_VALUE, quantity: 2 }],
		["non-numeric quantity", { quantity: Number.NaN }],
	])("rejects items with a %s price", async (_label, overrides) => {
		await expect(
			service.prepareCheckout({ items: [item(overrides)], subtotal: 0 }),
		).rejects.toThrow("Item has an invalid price.");
	});

	it("rejects orders whose totals overflow", async () => {
		await expect(
			service.prepareCheckout({
				items: [
					item({ unitPrice: 0, quantity: Number.MAX_VALUE }),
					item({ unitPrice: 0, quantity: Number.MAX_VALUE }),
				],
				subtotal: 0,
			}),
		).rejects.toThrow("Order calculation resulted in invalid values.");
	});
});
