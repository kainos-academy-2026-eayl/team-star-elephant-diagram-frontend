import { describe, expect, it } from "vitest";
import { buildCatalogueView, parseFilters } from "./catalogueFilters";
import type { CatalogueProduct } from "./models/product";

const product = (
	productId: number,
	category: string,
	price: number,
	name = `Product ${productId}`,
): CatalogueProduct => ({
	productId,
	name,
	category,
	description: "Description",
	price,
	imageURL: "",
	formattedPrice: `£${price}`,
	shortDescription: "Description",
});

const products = [
	product(1, "Laptops", 199.99),
	product(2, "Laptops", 1299),
	product(3, "Mice", 25.5),
	product(4, "Monitors", 249),
];

describe("parseFilters", () => {
	it("accepts one or many categories and drops blanks and duplicates", () => {
		expect(parseFilters({ category: "Mice" }).categories).toEqual(["Mice"]);
		expect(
			parseFilters({ category: ["Mice", "", "Mice", "Laptops"] }).categories,
		).toEqual(["Mice", "Laptops"]);
		expect(parseFilters({}).categories).toEqual([]);
	});

	it("ignores invalid or negative prices", () => {
		const filters = parseFilters({ minPrice: "abc", maxPrice: "-5" });

		expect(filters.minPrice).toBeUndefined();
		expect(filters.maxPrice).toBeUndefined();
		expect(parseFilters({ minPrice: "10" }).minPrice).toBe(10);
	});

	it("ignores array-valued price and query params", () => {
		const filters = parseFilters({ minPrice: ["1", "2"], q: ["a"] });

		expect(filters.minPrice).toBeUndefined();
		expect(filters.query).toBe("");
	});
});

describe("buildCatalogueView", () => {
	const view = (params: Record<string, unknown> = {}) =>
		buildCatalogueView(products, parseFilters(params));

	it("derives whole-pound slider bounds from the catalogue", () => {
		const { price } = view();

		expect(price).toMatchObject({ min: 25, max: 1299, lo: 25, hi: 1299 });
		expect(price.active).toBe(false);
		expect(price.hasRange).toBe(true);
	});

	it("filters by price range inclusive of the ends", () => {
		const names = view({ minPrice: "100", maxPrice: "250" }).products.map(
			(item) => item.productId,
		);

		expect(names).toEqual([1, 4]);
	});

	it("combines multiple categories as OR and price as AND", () => {
		const ids = view({
			category: ["Laptops", "Mice"],
			maxPrice: "300",
		}).products.map((item) => item.productId);

		expect(ids).toEqual([1, 3]);
	});

	it("clamps out-of-range prices and swaps a reversed range", () => {
		const { price } = view({ minPrice: "9999", maxPrice: "0" });

		expect(price.lo).toBe(25);
		expect(price.hi).toBe(1299);
		const swapped = view({ minPrice: "500", maxPrice: "100" }).price;
		expect([swapped.lo, swapped.hi]).toEqual([100, 500]);
	});

	it("counts categories across the whole catalogue and marks selections", () => {
		const { categories } = view({ category: "Mice", maxPrice: "30" });

		expect(categories).toEqual([
			{ name: "Laptops", count: 2, selected: false },
			{ name: "Mice", count: 1, selected: true },
			{ name: "Monitors", count: 1, selected: false },
		]);
	});

	it("builds removable active-filter links that keep the other filters", () => {
		const { activeFilters, clearHref } = view({
			q: "pro",
			category: ["Laptops", "Mice"],
			minPrice: "100",
			maxPrice: "500",
		});

		expect(activeFilters.map((filter) => filter.label)).toEqual([
			"Laptops",
			"Mice",
			"£100 – £500",
		]);
		expect(activeFilters[0]?.removeHref).toBe(
			"/products?q=pro&category=Mice&minPrice=100&maxPrice=500",
		);
		expect(activeFilters[2]?.removeHref).toBe(
			"/products?q=pro&category=Laptops&category=Mice",
		);
		expect(clearHref).toBe("/products?q=pro");
	});

	it("uses the category as the title only when exactly one is selected", () => {
		expect(view({ category: "Mice" }).title).toBe("Mice");
		expect(view({ category: ["Mice", "Laptops"] }).title).toBe("Top Picks");
		expect(view().title).toBe("Top Picks");
	});

	it("handles an empty catalogue without a price range", () => {
		const empty = buildCatalogueView([], parseFilters({}));

		expect(empty.price.hasRange).toBe(false);
		expect(empty.products).toEqual([]);
	});
});
