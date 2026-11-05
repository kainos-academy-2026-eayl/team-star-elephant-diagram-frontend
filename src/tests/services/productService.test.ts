import { describe, expect, it, vi } from "vitest";
import { BackendApi, BackendApiError } from "../../backendApi";
import type { ExpandedProduct, Product } from "../../models/product";
import {
	formatPrice,
	MAX_ORDER_QUANTITY,
	ProductService,
	previewDescription,
	safeImageURL,
} from "../../services/productService";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

const product = (overrides: Partial<Product> = {}): Product => ({
	productId: 1,
	name: "Kettle",
	category: "Kitchen",
	description: "Boils water quickly.",
	price: 349.99,
	imageURL: "/images/kettle.png",
	...overrides,
});

const expanded = (
	overrides: Partial<ExpandedProduct> = {},
): ExpandedProduct => ({
	...product(),
	inventory: { quantity: 10 },
	...overrides,
});

const setup = () => {
	const fetchMock = vi.fn<typeof fetch>();
	const service = new ProductService(
		new BackendApi("http://backend:4000", fetchMock),
	);
	return { fetchMock, service };
};

describe("product formatting helpers", () => {
	it("formats prices in pounds", () => {
		expect(formatPrice(349.99)).toBe("£349.99");
		expect(formatPrice(1500)).toBe("£1,500.00");
	});

	it("returns short descriptions unchanged apart from trimming", () => {
		expect(previewDescription("  Short text.  ")).toBe("Short text.");
	});

	it("truncates long descriptions at a word boundary with an ellipsis", () => {
		expect(previewDescription("One two, three four", 12)).toBe("One two…");
	});

	it("hard-cuts descriptions without spaces", () => {
		expect(previewDescription("abcdefghij", 4)).toBe("abcd…");
	});

	it.each([
		["https://cdn.example.com/a.png", "https://cdn.example.com/a.png"],
		["HTTP://cdn.example.com/a.png", "HTTP://cdn.example.com/a.png"],
		["/images/a.png", "/images/a.png"],
		["//evil.example/a.png", ""],
		["/\\evil.example/a.png", ""],
		["javascript:alert(1)", ""],
		["images/a.png", ""],
		[undefined, ""],
	])("safeImageURL(%s) returns %j", (url, expected) => {
		expect(safeImageURL(url)).toBe(expected);
	});
});

describe("ProductService", () => {
	it("fetches the catalogue and maps it for display", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json([
				product(),
				product({
					productId: 2,
					description: `${"word ".repeat(30)}end`,
					imageURL: "//evil.example/x.png",
				}),
			]),
		);

		const products = await service.getProducts();

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products",
		);
		expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
		expect(products[0]).toEqual({
			...product(),
			formattedPrice: "£349.99",
			shortDescription: "Boils water quickly.",
		});
		expect(products[1]?.imageURL).toBe("");
		expect(products[1]?.shortDescription).toMatch(/word…$/);
		expect(products[1]?.shortDescription.length).toBeLessThanOrEqual(111);
	});

	it("fetches a single product and derives stock information", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json(
				expanded({
					inventory: { quantity: 3 },
					images: [
						{ url: "/images/a.png", altText: "Front" },
						{ url: "javascript:alert(1)", altText: "Bad" },
						{ url: "https://cdn.example.com/b.png" } as {
							url: string;
							altText: string | null;
						},
					],
				}),
			),
		);

		const detail = await service.getProduct(1);

		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products/1",
		);
		expect(detail).toEqual({
			...product(),
			formattedPrice: "£349.99",
			images: [
				{ url: "/images/a.png", altText: "Front" },
				{ url: "https://cdn.example.com/b.png", altText: null },
			],
			stockQuantity: 3,
			inStock: true,
			lowStock: true,
			maxOrderQuantity: 3,
		});
	});

	it.each([
		[{ quantity: 10 }, 10, true, false, 10],
		[{ quantity: 5 }, 5, true, true, 5],
		[{ quantity: 5.9 }, 5, true, true, 5],
		[{ quantity: 500 }, 500, true, false, MAX_ORDER_QUANTITY],
		[{ quantity: 0 }, 0, false, false, 0],
		[{ quantity: -4 }, 0, false, false, 0],
		[null, 0, false, false, 0],
	])(
		"maps inventory %j to stock %d",
		async (inventory, stockQuantity, inStock, lowStock, maxOrderQuantity) => {
			const { fetchMock, service } = setup();
			fetchMock.mockResolvedValueOnce(json(expanded({ inventory })));

			await expect(service.getProduct(1)).resolves.toMatchObject({
				stockQuantity,
				inStock,
				lowStock,
				maxOrderQuantity,
				images: [],
			});
		},
	);

	it("rejects with the backend error for missing products", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json({ error: "Product not found" }, 404));

		const error = await service
			.getProduct(999)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(BackendApiError);
		expect(error).toMatchObject({ status: 404, message: "Product not found" });
	});

	it("propagates network failures", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

		await expect(service.getProducts()).rejects.toThrow("fetch failed");
	});
});
