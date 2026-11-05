import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AdminUserBasket,
	AdminUserBasketView,
	AdminUserDetailsResponse,
	AdminUserListQuery,
	AdminUserListResponse,
	AdminUserPaginationView,
	AdminUserStatus,
	AdminUserStatusAction,
	AdminUserStatusResponse,
	AdminUserStatusUpdate,
	AdminUserSummary,
	AdminUserView,
} from "../../models/adminUser";

describe("adminUser model", () => {
	it("defines the status unions", () => {
		expectTypeOf<AdminUserStatus>().toEqualTypeOf<"active" | "suspended">();
		expectTypeOf<AdminUserStatusAction>().toEqualTypeOf<
			"suspend" | "reactivate"
		>();
		expectTypeOf<AdminUserStatusUpdate>().toEqualTypeOf<
			"suspended" | "reactivated"
		>();
	});

	it("describes user summaries and list responses", () => {
		expectTypeOf<AdminUserSummary>().toEqualTypeOf<{
			id: number | string;
			name: string;
			email: string;
			registeredAt: string;
			status: AdminUserStatus | string;
		}>();
		expectTypeOf<Pick<AdminUserListResponse, "pagination">>().toEqualTypeOf<{
			pagination?: {
				page: number;
				pageSize: number;
				totalPages: number;
				totalUsers: number;
			};
		}>();
		expectTypeOf<AdminUserListQuery>().toEqualTypeOf<{
			search?: string;
			page?: number;
		}>();
		expectTypeOf<AdminUserStatusResponse>().toEqualTypeOf<{
			user: { id: number | string; status: AdminUserStatus | string };
		}>();
	});

	it("describes the view models", () => {
		expectTypeOf<AdminUserView["statusLabel"]>().toEqualTypeOf<
			"Active" | "Suspended"
		>();
		expectTypeOf<AdminUserView["isSuspended"]>().toEqualTypeOf<boolean>();
		expectTypeOf<AdminUserBasketView["items"]>().toEqualTypeOf<
			AdminUserBasket["items"]
		>();
		expectTypeOf<AdminUserBasketView>().not.toHaveProperty("subtotal");
		expectTypeOf<
			Pick<AdminUserPaginationView, "previousHref" | "nextHref">
		>().toEqualTypeOf<{
			previousHref?: string | undefined;
			nextHref?: string | undefined;
		}>();
	});

	it("accepts a realistic details response", () => {
		const response = {
			user: {
				id: 1,
				name: "A Shopper",
				email: "a@example.com",
				registeredAt: "2026-01-01",
				status: "active",
			},
			recentOrders: [
				{ id: 7, placedAt: "2026-02-01", status: "PENDING", total: 12.5 },
			],
			basket: {
				itemCount: 1,
				subtotal: 5,
				items: [{ productName: "Mug", quantity: 1 }],
			},
		} satisfies AdminUserDetailsResponse;

		expect(response.basket.items[0]?.productName).toBe("Mug");
	});
});
