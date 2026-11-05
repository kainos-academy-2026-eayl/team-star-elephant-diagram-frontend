import { describe, expect, expectTypeOf, it } from "vitest";
import {
	type AdminOrderDetails,
	type AdminOrderDetailsView,
	type AdminOrderListQuery,
	type AdminOrderListResponse,
	type AdminOrderPaginationView,
	type AdminOrderStatusError,
	type AdminOrderSummary,
	ORDER_STATUSES,
	type OrderStatus,
} from "../../models/adminOrder";

describe("adminOrder model", () => {
	it("lists the order statuses in lifecycle order", () => {
		expect(ORDER_STATUSES).toEqual([
			"PENDING",
			"PROCESSING",
			"SHIPPED",
			"DELIVERED",
			"CANCELLED",
		]);
	});

	it("has unique, upper-case statuses", () => {
		expect(new Set(ORDER_STATUSES).size).toBe(ORDER_STATUSES.length);
		for (const status of ORDER_STATUSES) {
			expect(status).toMatch(/^[A-Z]+$/);
		}
	});

	it("derives OrderStatus from ORDER_STATUSES", () => {
		expectTypeOf<OrderStatus>().toEqualTypeOf<
			"PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED"
		>();
		expectTypeOf(ORDER_STATUSES).toEqualTypeOf<
			readonly ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
		>();
		expectTypeOf<AdminOrderStatusError>().toEqualTypeOf<
			"invalid" | "forbidden" | "failed"
		>();
	});

	it("describes the API list and query shapes", () => {
		expectTypeOf<AdminOrderSummary>().toEqualTypeOf<{
			orderId: number | string;
			customer: { id: number | string; name: string; email: string };
			status: string;
			orderDate: string;
			totalCost: number;
		}>();
		expectTypeOf<Pick<AdminOrderListResponse, "pagination">>().toEqualTypeOf<{
			pagination?: {
				page: number;
				pageSize: number;
				totalPages: number;
				totalOrders: number;
			};
		}>();
		expectTypeOf<AdminOrderListQuery>().toEqualTypeOf<{
			search?: string;
			page?: number;
		}>();
		expectTypeOf<
			Pick<AdminOrderPaginationView, "previousHref" | "nextHref">
		>().toEqualTypeOf<{
			previousHref?: string | undefined;
			nextHref?: string | undefined;
		}>();
	});

	it("allows partial customer addresses on order details", () => {
		const details = {
			orderId: 1,
			status: "PENDING",
			orderDate: "2026-01-01",
			lastUpdated: "2026-01-02",
			customer: { id: 2, name: "A", email: "a@example.com", address: {} },
			items: [
				{
					productId: 3,
					productName: "Mug",
					quantity: 1,
					unitPrice: 5,
					itemTotal: 5,
				},
			],
			itemCount: 1,
			orderTotal: 5,
			allowedTransitions: ["PROCESSING"],
		} satisfies AdminOrderDetails;

		expect(details.customer.address).toEqual({});
		expectTypeOf<
			NonNullable<AdminOrderDetails["customer"]["address"]>
		>().toEqualTypeOf<{
			line1?: string;
			line2?: string;
			city?: string;
			postcode?: string;
		}>();
	});

	it("replaces raw items with view items on the details view", () => {
		type ViewOrder = AdminOrderDetailsView["order"];
		expectTypeOf<ViewOrder["items"][number]>().toHaveProperty(
			"displayUnitPrice",
		);
		expectTypeOf<ViewOrder["transitions"]>().toEqualTypeOf<
			Array<{ value: string; label: string }>
		>();
		expectTypeOf<
			AdminOrderDetailsView["canUpdateStatus"]
		>().toEqualTypeOf<boolean>();
	});
});
