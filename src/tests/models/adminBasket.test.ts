import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	BasketDetails,
	BasketDetailsResponse,
	BasketItem,
	BasketListResponse,
	BasketSummary,
	BasketSummaryView,
	CustomerSummary,
} from "../../models/adminBasket";

describe("adminBasket model", () => {
	it("describes basket summaries and their view", () => {
		expectTypeOf<BasketSummary>().toEqualTypeOf<{
			basketId: number | string;
			customerName: string;
			customerEmail: string;
			itemCount: number;
			total: string;
			lastActivity: string;
			status: string;
		}>();
		expectTypeOf<BasketSummaryView>().toExtend<BasketSummary>();
		expectTypeOf<Omit<BasketSummaryView, keyof BasketSummary>>().toEqualTypeOf<{
			detailsHref: string;
		}>();
		expectTypeOf<BasketListResponse>().toEqualTypeOf<{
			baskets: BasketSummary[];
		}>();
	});

	it("describes basket details with customer and items", () => {
		expectTypeOf<CustomerSummary>().toEqualTypeOf<{
			name: string;
			email: string;
		}>();
		expectTypeOf<BasketItem>().toEqualTypeOf<{
			productName: string;
			quantity: number;
			unitPrice: string;
			totalPrice: string;
		}>();
		expectTypeOf<BasketDetails["customer"]>().toEqualTypeOf<CustomerSummary>();
		expectTypeOf<BasketDetails["items"]>().toEqualTypeOf<BasketItem[]>();
		expectTypeOf<BasketDetailsResponse>().toEqualTypeOf<{
			basket: BasketDetails;
		}>();
	});

	it("accepts a realistic details response", () => {
		const response = {
			basket: {
				basketId: "b-1",
				createdAt: "2026-01-01",
				lastActivity: "2026-01-02",
				status: "active",
				customer: { name: "A Shopper", email: "a@example.com" },
				items: [
					{
						productName: "Mug",
						quantity: 2,
						unitPrice: "£5.00",
						totalPrice: "£10.00",
					},
				],
				itemCount: 2,
				total: "£10.00",
			},
		} satisfies BasketDetailsResponse;

		expect(response.basket.items).toHaveLength(1);
	});
});
