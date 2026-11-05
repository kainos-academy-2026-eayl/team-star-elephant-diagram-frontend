import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	CatalogueProduct,
	ExpandedProduct,
	Product,
	ProductDetail,
	ProductImage,
	ProductInventory,
} from "../../models/product";

describe("product model", () => {
	it("mirrors the backend product contract", () => {
		expectTypeOf<Product>().toEqualTypeOf<{
			productId: number;
			name: string;
			category: string;
			description: string;
			price: number;
			imageURL: string;
		}>();
		expectTypeOf<ProductInventory>().toEqualTypeOf<{ quantity: number }>();
		expectTypeOf<ProductImage>().toEqualTypeOf<{
			url: string;
			altText: string | null;
		}>();
	});

	it("allows missing inventory and images on expanded products", () => {
		expectTypeOf<
			Pick<ExpandedProduct, "inventory" | "images">
		>().toEqualTypeOf<{
			inventory: ProductInventory | null;
			images?: ProductImage[];
		}>();
		expectTypeOf<ExpandedProduct>().toExtend<Product>();
	});

	it("adds display fields to catalogue and detail products", () => {
		expectTypeOf<CatalogueProduct>().toExtend<Product>();
		expectTypeOf<Omit<CatalogueProduct, keyof Product>>().toEqualTypeOf<{
			formattedPrice: string;
			shortDescription: string;
		}>();
		expectTypeOf<ProductDetail>().toExtend<Product>();
		expectTypeOf<Omit<ProductDetail, keyof Product>>().toEqualTypeOf<{
			formattedPrice: string;
			images: ProductImage[];
			stockQuantity: number;
			inStock: boolean;
			lowStock: boolean;
			maxOrderQuantity: number;
		}>();
	});

	it("accepts an expanded product without images", () => {
		const product = {
			productId: 1,
			name: "Mug",
			category: "Home",
			description: "A mug",
			price: 9.99,
			imageURL: "/images/mug.png",
			inventory: null,
		} satisfies ExpandedProduct;

		expect(product.inventory).toBeNull();
	});
});
