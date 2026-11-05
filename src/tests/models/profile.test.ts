import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	ProfileData,
	ProfileOrder,
	ProfileOrderItem,
	ProfileUser,
} from "../../models/profile";

describe("profile model", () => {
	it("describes the profile user with optional contact details", () => {
		expectTypeOf<ProfileUser>().toEqualTypeOf<{
			firstName: string;
			lastName: string;
			email: string;
			phone?: string;
			address?: {
				line1: string;
				line2?: string;
				city: string;
				postcode: string;
			};
			memberSince: string;
		}>();
	});

	it("describes orders and their items", () => {
		expectTypeOf<ProfileOrderItem>().toEqualTypeOf<{
			productName: string;
			quantity: number;
			displayUnitPrice: string;
			displaySubtotal: string;
		}>();
		expectTypeOf<Pick<ProfileOrder, "id" | "orderNumber">>().toEqualTypeOf<{
			id?: string | number;
			orderNumber?: string | number;
		}>();
		expectTypeOf<ProfileOrder["items"]>().toEqualTypeOf<ProfileOrderItem[]>();
	});

	it("describes profile data with an optional ordersUnavailable flag", () => {
		expectTypeOf<ProfileData>().toEqualTypeOf<{
			user: ProfileUser;
			orders: ProfileOrder[];
			ordersUnavailable?: boolean;
		}>();
	});

	it("accepts minimal profile data", () => {
		const data = {
			user: {
				firstName: "A",
				lastName: "Shopper",
				email: "a@example.com",
				memberSince: "2026",
			},
			orders: [],
		} satisfies ProfileData;

		expect(data.orders).toEqual([]);
	});
});
