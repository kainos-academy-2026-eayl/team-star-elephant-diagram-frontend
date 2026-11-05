import type { CatalogueProduct } from "./models/product";

export const CATALOGUE_TITLE = "Browse Products";

export interface CatalogueFilters {
	query: string;
	categories: string[];
	minPrice?: number | undefined;
	maxPrice?: number | undefined;
}

const asList = (value: unknown): string[] =>
	(Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === "string" && item.trim() !== "",
	);

const asPrice = (value: unknown): number | undefined => {
	if (typeof value !== "string" || value.trim() === "") {
		return undefined;
	}
	const price = Number(value);
	return Number.isFinite(price) && price >= 0 ? price : undefined;
};

export function parseFilters(
	params: Record<string, unknown>,
): CatalogueFilters {
	return {
		query: typeof params.q === "string" ? params.q.trim() : "",
		categories: [...new Set(asList(params.category))],
		minPrice: asPrice(params.minPrice),
		maxPrice: asPrice(params.maxPrice),
	};
}

const buildHref = (
	query: string,
	categories: string[],
	price?: { lo: number; hi: number },
): string => {
	const parts: string[] = [];
	if (query) {
		parts.push(`q=${encodeURIComponent(query)}`);
	}
	for (const category of categories) {
		parts.push(`category=${encodeURIComponent(category)}`);
	}
	if (price) {
		parts.push(`minPrice=${price.lo}`, `maxPrice=${price.hi}`);
	}
	return parts.length ? `/products?${parts.join("&")}` : "/products";
};

export function buildCatalogueView(
	products: CatalogueProduct[],
	filters: CatalogueFilters,
) {
	const prices = products.map((product) => product.price);
	const bounds = prices.length
		? {
				min: Math.floor(Math.min(...prices)),
				max: Math.ceil(Math.max(...prices)),
			}
		: { min: 0, max: 0 };
	const clamp = (value: number) =>
		Math.min(bounds.max, Math.max(bounds.min, value));

	let lo = clamp(filters.minPrice ?? bounds.min);
	let hi = clamp(filters.maxPrice ?? bounds.max);
	if (lo > hi) {
		[lo, hi] = [hi, lo];
	}
	const priceActive = lo > bounds.min || hi < bounds.max;
	const span = bounds.max - bounds.min;
	const percent = (value: number) =>
		span ? Math.round(((value - bounds.min) / span) * 1000) / 10 : 0;

	const needle = filters.query.toLowerCase();
	const filtered = products.filter(
		(product) =>
			(filters.categories.length === 0 ||
				filters.categories.includes(product.category)) &&
			product.price >= lo &&
			product.price <= hi &&
			`${product.name} ${product.category} ${product.description}`
				.toLowerCase()
				.includes(needle),
	);

	const counts = new Map<string, number>();
	for (const product of products) {
		counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
	}
	const categories = [...counts.keys()].sort().map((name) => ({
		name,
		count: counts.get(name) ?? 0,
		selected: filters.categories.includes(name),
	}));

	const price = priceActive ? { lo, hi } : undefined;
	const activeFilters = [
		...filters.categories.map((name) => ({
			label: name,
			removeHref: buildHref(
				filters.query,
				filters.categories.filter((category) => category !== name),
				price,
			),
		})),
		...(price
			? [
					{
						label: `£${lo} – £${hi}`,
						removeHref: buildHref(filters.query, filters.categories),
					},
				]
			: []),
	];

	return {
		products: filtered,
		categories,
		selectedCategories: filters.categories,
		query: filters.query,
		title:
			filters.categories.length === 1 ? filters.categories[0] : CATALOGUE_TITLE,
		price: {
			min: bounds.min,
			max: bounds.max,
			lo,
			hi,
			loPercent: percent(lo),
			hiPercent: percent(hi),
			active: priceActive,
			hasRange: span > 0,
		},
		activeFilters,
		clearHref: buildHref(filters.query, []),
	};
}
