import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import {
	type InventoryAdjustment,
	type InventoryPage,
	type InventoryProduct,
	type InventoryProductView,
	type InventoryQuery,
	STOCK_STATUSES,
	type SupplierOption,
} from "../models/inventory";
import type { SessionService } from "./sessionService";

const API_PATH = "/api/admin/inventory";
const PAGE_PATH = "/admin/inventory";
const SORT_FIELDS = [
	"name",
	"sku",
	"price",
	"stockQuantity",
	"lowStockThreshold",
	"stockStatus",
];
const STATUS_VIEWS = {
	IN_STOCK: { statusLabel: "In Stock", statusClass: "success" },
	LOW_STOCK: { statusLabel: "Low Stock", statusClass: "warning" },
	OUT_OF_STOCK: { statusLabel: "Out Of Stock", statusClass: "danger" },
};
const STATUS_TABS = [
	{ value: "", label: "All" },
	{ value: "IN_STOCK", label: "In Stock" },
	{ value: "LOW_STOCK", label: "Low Stock" },
	{ value: "OUT_OF_STOCK", label: "Out Of Stock" },
];
const SORT_OPTIONS = [
	{ sort: "name", direction: "asc", label: "Name (A–Z)" },
	{ sort: "name", direction: "desc", label: "Name (Z–A)" },
	{ sort: "price", direction: "asc", label: "Price (low → high)" },
	{ sort: "price", direction: "desc", label: "Price (high → low)" },
	{ sort: "stockQuantity", direction: "asc", label: "Stock (low → high)" },
	{ sort: "stockQuantity", direction: "desc", label: "Stock (high → low)" },
	{
		sort: "lowStockThreshold",
		direction: "asc",
		label: "Threshold (low → high)",
	},
	{
		sort: "lowStockThreshold",
		direction: "desc",
		label: "Threshold (high → low)",
	},
	{ sort: "stockStatus", direction: "asc", label: "Status" },
	{ sort: "sku", direction: "asc", label: "SKU (A–Z)" },
	{ sort: "sku", direction: "desc", label: "SKU (Z–A)" },
];
const SORTABLE_COLUMNS = [
	{ key: "name", label: "Name" },
	{ key: "sku", label: "SKU" },
	{ key: "price", label: "Price" },
	{ key: "stockQuantity", label: "Current Stock" },
	{ key: "lowStockThreshold", label: "Threshold" },
	{ key: "stockStatus", label: "Status" },
];
const price = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});
const productView = (product: InventoryProduct): InventoryProductView => ({
	...product,
	href: `${PAGE_PATH}/${product.productId}`,
	displayPrice: price.format(Number(product.price)),
	...STATUS_VIEWS[product.stockStatus],
});

export class InventoryService {
	constructor(private readonly sessions: SessionService) {}

	query(req: Request): InventoryQuery {
		const text = (key: string, fallback = ""): string => {
			const value = req.query[key];
			if (value === undefined) return fallback;
			if (typeof value !== "string")
				throw new BackendApiError(400, "Invalid inventory filters.");
			return value.trim();
		};
		const search = text("q");
		const status = text("status");
		// The sort dropdown submits a combined "field-direction" value.
		const rawOrder = text("order");
		const order = /^(\w+)-(asc|desc)$/.exec(rawOrder);
		const sort = order?.[1] ?? text("sort", "name");
		const direction = order?.[2] ?? text("direction", "asc");
		const rawPage = text("page", "1");
		const page = Number(rawPage);
		if (
			(rawOrder && !order) ||
			search.length > 100 ||
			(status && !STOCK_STATUSES.some((value) => value === status)) ||
			!SORT_FIELDS.includes(sort) ||
			!["asc", "desc"].includes(direction) ||
			!/^[1-9]\d*$/.test(rawPage) ||
			!Number.isInteger(page) ||
			page > 100_000
		) {
			throw new BackendApiError(400, "Invalid inventory filters.");
		}
		return { search, status, sort, direction, page };
	}

	async list(req: Request, res: Response, query: InventoryQuery) {
		const params = new URLSearchParams({
			search: query.search,
			sort: query.sort,
			direction: query.direction,
			page: String(query.page),
		});
		if (query.status) params.set("status", query.status);
		const result = await this.sessions.request<InventoryPage<InventoryProduct>>(
			`${API_PATH}?${params}`,
			req,
			res,
		);
		return {
			...result,
			items: result.items.map(productView),
			filters: this.filters(query),
			pagination: this.pagination(
				result,
				PAGE_PATH,
				new URLSearchParams({
					q: query.search,
					status: query.status,
					sort: query.sort,
					direction: query.direction,
				}),
			),
		};
	}

	private filters(query: InventoryQuery) {
		const href = (changes: Partial<InventoryQuery>): string => {
			const next = { ...query, ...changes };
			const params = new URLSearchParams();
			if (next.search) params.set("q", next.search);
			if (next.status) params.set("status", next.status);
			params.set("sort", next.sort);
			params.set("direction", next.direction);
			return `${PAGE_PATH}?${params}`;
		};
		return {
			order: `${query.sort}-${query.direction}`,
			sortOptions: SORT_OPTIONS.map((option) => ({
				value: `${option.sort}-${option.direction}`,
				label: option.label,
				href: href({ sort: option.sort, direction: option.direction }),
				active:
					option.sort === query.sort && option.direction === query.direction,
			})),
			statusTabs: STATUS_TABS.map((tab) => ({
				...tab,
				href: href({ status: tab.value }),
				active: query.status === tab.value,
			})),
			columns: SORTABLE_COLUMNS.map((column) => {
				const active = query.sort === column.key;
				const ascending = active && query.direction === "asc";
				return {
					...column,
					active,
					ariaSort: active ? (ascending ? "ascending" : "descending") : "none",
					href: href({
						sort: column.key,
						direction: ascending ? "desc" : "asc",
					}),
				};
			}),
			clearSearchHref: href({ search: "" }),
		};
	}

	async details(req: Request, res: Response, id: string) {
		const result = await this.sessions.request<{ product: InventoryProduct }>(
			`${API_PATH}/${id}`,
			req,
			res,
		);
		return productView(result.product);
	}

	async history(req: Request, res: Response, id: string) {
		const page = this.query(req).page;
		const result = await this.sessions.request<
			InventoryPage<InventoryAdjustment>
		>(`${API_PATH}/${id}/history?page=${page}`, req, res);
		return {
			...result,
			items: result.items.map((row) => ({
				...row,
				displayDate: new Intl.DateTimeFormat("en-GB", {
					dateStyle: "medium",
					timeStyle: "short",
					timeZone: "UTC",
				}).format(new Date(row.createdAt)),
				user: `${row.adjustedBy.forename} ${row.adjustedBy.surname}`,
				displayAdjustment:
					row.adjustment > 0 ? `+${row.adjustment}` : String(row.adjustment),
			})),
			pagination: this.pagination(result, `${PAGE_PATH}/${id}`),
		};
	}

	async suppliers(req: Request, res: Response): Promise<SupplierOption[]> {
		const result = await this.sessions.request<{ suppliers: SupplierOption[] }>(
			`${API_PATH}/suppliers`,
			req,
			res,
		);
		return result.suppliers;
	}

	values(req: Request): Record<string, string> {
		return Object.fromEntries(
			[
				"name",
				"description",
				"price",
				"category",
				"sku",
				"stockQuantity",
				"lowStockThreshold",
				"imageURL",
				"supplierId",
				"reason",
				"adjustment",
			].map((key) => [
				key,
				typeof req.body?.[key] === "string" ? req.body[key] : "",
			]),
		);
	}

	async save(
		req: Request,
		res: Response,
		values: Record<string, string>,
		id?: string,
	): Promise<InventoryProduct> {
		const body: Record<string, string | number> = Object.fromEntries(
			["name", "description", "price", "category", "imageURL"].map((key) => [
				key,
				values[key] ?? "",
			]),
		);
		body.stockQuantity = this.integer(values.stockQuantity, "stockQuantity");
		body.lowStockThreshold = this.integer(
			values.lowStockThreshold,
			"lowStockThreshold",
		);
		if (id) body.reason = values.reason ?? "";
		else {
			body.sku = values.sku ?? "";
			body.supplierId = this.integer(values.supplierId, "supplierId");
		}
		return this.sessions.request<InventoryProduct>(
			`${API_PATH}${id ? `/${id}` : ""}`,
			req,
			res,
			{},
			body,
			id ? "PUT" : "POST",
		);
	}

	async adjust(
		req: Request,
		res: Response,
		id: string,
		values: Record<string, string>,
	): Promise<void> {
		await this.sessions.request(
			`${API_PATH}/${id}/stock`,
			req,
			res,
			{},
			{
				adjustment: this.integer(values.adjustment, "adjustment", true),
				reason: values.reason ?? "",
			},
			"PATCH",
		);
	}

	async threshold(
		req: Request,
		res: Response,
		id: string,
		values: Record<string, string>,
	): Promise<void> {
		await this.sessions.request(
			`${API_PATH}/${id}/threshold`,
			req,
			res,
			{},
			{
				lowStockThreshold: this.integer(
					values.lowStockThreshold,
					"lowStockThreshold",
				),
			},
			"PATCH",
		);
	}

	async delete(req: Request, res: Response, id: string): Promise<void> {
		await this.sessions.request(
			`${API_PATH}/${id}`,
			req,
			res,
			{},
			undefined,
			"DELETE",
		);
	}

	private integer(
		value: string | undefined,
		field: string,
		signed = false,
	): number {
		const number = Number(value);
		if (
			!(signed ? /^-?\d+$/ : /^\d+$/).test(value ?? "") ||
			!Number.isInteger(number) ||
			Math.abs(number) > 2_147_483_647
		) {
			throw new BackendApiError(400, "Check the highlighted fields.", {
				[field]: ["Enter a valid whole number."],
			});
		}
		return number;
	}

	private pagination(
		result: Pick<InventoryPage<unknown>, "currentPage" | "totalPages">,
		path: string,
		params = new URLSearchParams(),
	) {
		const href = (page: number): string => {
			const query = new URLSearchParams(params);
			query.set("page", String(page));
			return `${path}?${query}`;
		};
		return {
			page: result.currentPage,
			totalPages: result.totalPages,
			previousHref:
				result.currentPage > 1 ? href(result.currentPage - 1) : undefined,
			nextHref:
				result.currentPage < result.totalPages
					? href(result.currentPage + 1)
					: undefined,
		};
	}
}
