import type { Request, Response } from "express";
import type { BackendApi } from "../backendApi";
import type {
	BasketDetails,
	BasketDetailsResponse,
	BasketListResponse,
	BasketSummary,
	BasketSummaryView,
} from "../models/adminBasket";
import type {
	AdminUserDetailsResponse,
	AdminUserDetailsView,
	AdminUserListQuery,
	AdminUserListResponse,
	AdminUserListView,
	AdminUserPaginationView,
	AdminUserStatusAction,
	AdminUserStatusResponse,
	AdminUserStatusUpdate,
	AdminUserSummary,
	AdminUserView,
} from "../models/adminUser";
import type { SessionService } from "./sessionService";

export interface AdminDashboard {
	staff: { name: string };
	sections: Array<{ label: string }>;
	quickActions: Array<{ label: string }>;
	cards: Array<{ label: string; value: string }>;
	recentOrders: Array<{
		id: number | string;
		customer: string;
		date: string;
		status: string;
	}>;
	newUsers: Array<{ name: string; email: string; joined: string }>;
	stockChanges: Array<{
		product: string;
		amount: string;
		reason: string;
	}>;
}

export interface AdminRequestCredentials {
	authorization?: string;
	cookie?: string;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BEARER_PATTERN = /^Bearer\s+\S+$/i;
const MAX_SEARCH_LENGTH = 100;

const STATUS_UPDATES: Record<AdminUserStatusAction, AdminUserStatusUpdate> = {
	suspend: "suspended",
	reactivate: "reactivated",
};

const toHeaders = (
	credentials: AdminRequestCredentials,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (credentials.authorization) {
		headers.Authorization = credentials.authorization;
	}
	if (credentials.cookie) {
		headers.Cookie = credentials.cookie;
	}
	return headers;
};

const basketPath = (id: string): string =>
	`/admin/baskets/${encodeURIComponent(id)}`;

const userPath = (id: string): string =>
	`/admin/users/${encodeURIComponent(id)}`;

const formatPrice = (amount: number): string =>
	new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: "GBP",
	}).format(amount);

const formatDate = (value: string): string => {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat("en-GB", {
				day: "numeric",
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			}).format(date);
};

const toUserView = (user: AdminUserSummary): AdminUserView => {
	const isSuspended = String(user.status ?? "").toLowerCase() === "suspended";
	return {
		...user,
		detailsHref: userPath(String(user.id)),
		displayRegisteredAt: formatDate(user.registeredAt),
		statusLabel: isSuspended ? "Suspended" : "Active",
		isSuspended,
	};
};

const toPaginationView = (
	result: AdminUserListResponse,
	search: string,
): AdminUserPaginationView | undefined => {
	const pagination = result.pagination;
	if (!pagination || pagination.totalPages <= 1) {
		return undefined;
	}
	const pageHref = (page: number): string => {
		const params = new URLSearchParams();
		if (search) {
			params.set("q", search);
		}
		params.set("page", String(page));
		return `/admin/users?${params.toString()}`;
	};
	return {
		...pagination,
		previousHref:
			pagination.page > 1 ? pageHref(pagination.page - 1) : undefined,
		nextHref:
			pagination.page < pagination.totalPages
				? pageHref(pagination.page + 1)
				: undefined,
	};
};

export class AdminService {
	constructor(
		private readonly api: BackendApi,
		private readonly sessions: SessionService,
	) {}

	getDashboard(req: Request, res: Response): Promise<AdminDashboard> {
		return this.sessions.request<AdminDashboard>("/admin", req, res);
	}

	resolveCredentials(
		authorization?: string,
		cookie?: string,
	): AdminRequestCredentials | undefined {
		const credentials: AdminRequestCredentials = {
			...(authorization && BEARER_PATTERN.test(authorization)
				? { authorization }
				: {}),
			...(cookie ? { cookie } : {}),
		};
		return credentials.authorization || credentials.cookie
			? credentials
			: undefined;
	}

	normaliseSearch(value: unknown): string {
		return typeof value === "string"
			? value.trim().slice(0, MAX_SEARCH_LENGTH)
			: "";
	}

	normalisePage(value: unknown): number {
		const page = typeof value === "string" ? Number(value) : 1;
		return Number.isInteger(page) && page > 0 ? page : 1;
	}

	getUserDetailsHref(id: string): string {
		return userPath(id);
	}

	isValidId(id: string): boolean {
		return ID_PATTERN.test(id);
	}

	isSameOrigin(origin?: string, host?: string, protocol = "http"): boolean {
		if (!origin || !host) {
			return false;
		}
		try {
			return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
		} catch {
			return false;
		}
	}

	async getUsers(
		credentials: AdminRequestCredentials,
		query: AdminUserListQuery = {},
	): Promise<AdminUserListView> {
		const search = query.search ?? "";
		const params = new URLSearchParams();
		if (search) {
			params.set("search", search);
		}
		if (query.page && query.page > 1) {
			params.set("page", String(query.page));
		}
		const queryString = params.toString();
		const result = await this.api.request<AdminUserListResponse>(
			`/admin/users${queryString ? `?${queryString}` : ""}`,
			undefined,
			toHeaders(credentials),
		);
		const pagination = toPaginationView(result, search);
		return {
			users: (result.users ?? []).map(toUserView),
			...(pagination ? { pagination } : {}),
		};
	}

	async getUserById(
		credentials: AdminRequestCredentials,
		id: string,
	): Promise<AdminUserDetailsView> {
		const details = await this.api.request<AdminUserDetailsResponse>(
			userPath(id),
			undefined,
			toHeaders(credentials),
		);
		return {
			user: toUserView(details.user),
			recentOrders: (details.recentOrders ?? []).map((order) => ({
				...order,
				displayPlacedAt: formatDate(order.placedAt),
				displayTotal: formatPrice(order.total),
			})),
			basket: {
				itemCount: details.basket?.itemCount ?? 0,
				items: details.basket?.items ?? [],
				displaySubtotal: formatPrice(details.basket?.subtotal ?? 0),
			},
		};
	}

	async changeUserStatus(
		credentials: AdminRequestCredentials,
		id: string,
		action: AdminUserStatusAction,
	): Promise<AdminUserStatusUpdate> {
		// BackendApi sends a POST whenever a body is supplied.
		await this.api.request<AdminUserStatusResponse>(
			`${userPath(id)}/${action}`,
			{},
			toHeaders(credentials),
		);
		return STATUS_UPDATES[action];
	}

	parseStatusUpdate(value: unknown): AdminUserStatusUpdate | undefined {
		return value === "suspended" || value === "reactivated" ? value : undefined;
	}

	async getBaskets(
		credentials: AdminRequestCredentials,
		search = "",
	): Promise<BasketSummaryView[]> {
		const { baskets } = await this.api.request<BasketListResponse>(
			"/admin/baskets",
			undefined,
			toHeaders(credentials),
		);
		const normalisedSearch = search.trim().toLowerCase();
		return (baskets ?? [])
			.filter(
				(basket: BasketSummary) =>
					!normalisedSearch ||
					[basket.basketId, basket.customerName, basket.customerEmail]
						.join(" ")
						.toLowerCase()
						.includes(normalisedSearch),
			)
			.map((basket) => ({
				...basket,
				detailsHref: basketPath(String(basket.basketId)),
			}));
	}

	async getBasketById(
		credentials: AdminRequestCredentials,
		id: string,
	): Promise<BasketDetails> {
		const { basket } = await this.api.request<BasketDetailsResponse>(
			basketPath(id),
			undefined,
			toHeaders(credentials),
		);
		return basket;
	}
}
