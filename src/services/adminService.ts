import type { Request, Response } from "express";
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
	role?: string;
	dashboard?: string;
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
	lowStock?: {
		total: number;
		items: Array<{
			inventoryId: number;
			product: string;
			supplier: string;
			quantity: number;
			reorderLevel: number;
		}>;
	} | null;
}

export interface AdminNavItem {
	key: string;
	label: string;
	href: string;
}

// What the logged-in role may see, derived only from the backend's role-scoped dashboard response.
export interface AdminAccess {
	staff: { name: string };
	role: string;
	roleLabel: string;
	isFinanceDashboard: boolean;
	canViewInventory: boolean;
	nav: AdminNavItem[];
	canChangeUserStatus: boolean;
	canDeleteUsers: boolean;
}

// Backend quick action label granted to roles holding users:suspend.
const USER_STATUS_QUICK_ACTION = "Suspend or reactivate customers";
const USER_DELETE_QUICK_ACTION = "Permanently delete customers";
const ROLE_LABELS: Record<string, string> = {
	SuperAdmin: "Super Admin",
	Admin: "Admin",
	InventoryManager: "Inventory Manager",
	FinanceManager: "Finance Manager",
	CustomerService: "Customer Service",
};
const STAFF_MANAGEMENT_LABELS = new Set([
	"Admin accounts",
	"Permissions",
	"Manage admin accounts",
	"Manage permissions",
]);

const DASHBOARD_NAV_ITEM: AdminNavItem = {
	key: "dashboard",
	label: "Dashboard",
	href: "/admin",
};

const SECTION_HREFS = new Map([
	["users", "/admin/users"],
	["baskets", "/admin/baskets"],
	["orders", "/admin/orders"],
	["inventory", "/admin/inventory"],
]);

const toNavKey = (label: string): string =>
	label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const toNav = (sections: AdminDashboard["sections"]): AdminNavItem[] => [
	DASHBOARD_NAV_ITEM,
	...sections
		.filter((section) => typeof section?.label === "string")
		.flatMap((section) => {
			const key = toNavKey(section.label);
			const href = SECTION_HREFS.get(key);
			return key && key !== DASHBOARD_NAV_ITEM.key && href
				? [{ key, label: section.label, href }]
				: [];
		}),
];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SEARCH_LENGTH = 100;

const STATUS_UPDATES: Record<AdminUserStatusAction, AdminUserStatusUpdate> = {
	suspend: "suspended",
	reactivate: "reactivated",
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
	constructor(private readonly sessions: SessionService) {}

	async getDashboard(
		req: Request,
		res: Response,
	): Promise<AdminDashboard & AdminAccess> {
		const dashboard = await this.sessions.request<AdminDashboard>(
			"/admin",
			req,
			res,
		);
		const access = this.toAccess(dashboard);
		return {
			...dashboard,
			...access,
			lowStock: access.canViewInventory ? (dashboard.lowStock ?? null) : null,
			sections: (dashboard.sections ?? []).filter(
				(section) => !STAFF_MANAGEMENT_LABELS.has(section.label),
			),
			quickActions: [],
		};
	}

	async getAccess(req: Request, res: Response): Promise<AdminAccess> {
		return this.toAccess(
			await this.sessions.request<AdminDashboard>("/admin", req, res),
		);
	}

	toAccess(dashboard: Partial<AdminDashboard>): AdminAccess {
		const sections = Array.isArray(dashboard.sections)
			? dashboard.sections
			: [];
		const quickActions = Array.isArray(dashboard.quickActions)
			? dashboard.quickActions
			: [];
		const isFinanceDashboard = dashboard.role === "FinanceManager";
		return {
			staff: { name: dashboard.staff?.name ?? "" },
			role: dashboard.role ?? "",
			roleLabel: ROLE_LABELS[dashboard.role ?? ""] ?? dashboard.role ?? "",
			isFinanceDashboard,
			canViewInventory:
				!isFinanceDashboard &&
				sections.some(
					(section) =>
						typeof section?.label === "string" &&
						toNavKey(section.label) === "inventory",
				),
			nav: isFinanceDashboard ? [DASHBOARD_NAV_ITEM] : toNav(sections),
			canChangeUserStatus:
				!isFinanceDashboard &&
				quickActions.some(
					(action) => action?.label === USER_STATUS_QUICK_ACTION,
				),
			canDeleteUsers:
				!isFinanceDashboard &&
				quickActions.some(
					(action) => action?.label === USER_DELETE_QUICK_ACTION,
				),
		};
	}

	// Used when the role cannot be confirmed: only the dashboard link and no actions.
	getRestrictedAccess(): AdminAccess {
		return this.toAccess({});
	}

	isCustomerSession(req: Request): boolean {
		return this.sessions.accessTokenKind(req) === "customer";
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
		req: Request,
		res: Response,
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
		const result = await this.sessions.request<AdminUserListResponse>(
			`/admin/users${queryString ? `?${queryString}` : ""}`,
			req,
			res,
		);
		const pagination = toPaginationView(result, search);
		return {
			users: (result.users ?? []).map(toUserView),
			...(pagination ? { pagination } : {}),
		};
	}

	async getUserById(
		req: Request,
		res: Response,
		id: string,
	): Promise<AdminUserDetailsView> {
		const details = await this.sessions.request<AdminUserDetailsResponse>(
			userPath(id),
			req,
			res,
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
		req: Request,
		res: Response,
		id: string,
		action: AdminUserStatusAction,
	): Promise<AdminUserStatusUpdate> {
		// BackendApi sends a POST whenever a body is supplied.
		await this.sessions.request<AdminUserStatusResponse>(
			`${userPath(id)}/${action}`,
			req,
			res,
			{},
			{},
		);
		return STATUS_UPDATES[action];
	}

	async deleteUser(req: Request, res: Response, id: string): Promise<void> {
		await this.sessions.request(`${userPath(id)}/delete`, req, res, {}, {});
	}

	parseStatusUpdate(value: unknown): AdminUserStatusUpdate | undefined {
		return value === "suspended" || value === "reactivated" ? value : undefined;
	}

	// The backend performs the (multi-term) search, so results are rendered as returned.
	async getBaskets(
		req: Request,
		res: Response,
		search = "",
	): Promise<BasketSummaryView[]> {
		const params = new URLSearchParams();
		if (search) {
			params.set("search", search);
		}
		const queryString = params.toString();
		const { baskets } = await this.sessions.request<BasketListResponse>(
			`/admin/baskets${queryString ? `?${queryString}` : ""}`,
			req,
			res,
		);
		return (baskets ?? []).map((basket: BasketSummary) => ({
			...basket,
			detailsHref: basketPath(String(basket.basketId)),
		}));
	}

	async getBasketById(
		req: Request,
		res: Response,
		id: string,
	): Promise<BasketDetails> {
		const { basket } = await this.sessions.request<BasketDetailsResponse>(
			basketPath(id),
			req,
			res,
		);
		return basket;
	}
}
