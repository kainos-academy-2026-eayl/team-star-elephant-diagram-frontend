import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type {
	AdminUserDetailsResponse,
	AdminUserListResponse,
	AdminUserSummary,
} from "../models/adminUser";
import type {
	AdminRequestCredentials,
	AdminService,
} from "../services/adminService";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SEARCH_LENGTH = 100;

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

const toUserView = (user: AdminUserSummary) => {
	const status = String(user.status ?? "").toLowerCase();
	return {
		...user,
		detailsHref: `/admin/users/${encodeURIComponent(String(user.id))}`,
		displayRegisteredAt: formatDate(user.registeredAt),
		statusLabel: status === "suspended" ? "Suspended" : "Active",
		isSuspended: status === "suspended",
	};
};

const getCredentials = (req: Request): AdminRequestCredentials => {
	const authorization = req.get("authorization");
	const cookie = req.get("cookie");
	return {
		...(authorization && /^Bearer\s+\S+$/i.test(authorization)
			? { authorization }
			: {}),
		...(cookie ? { cookie } : {}),
	};
};

const hasCredentials = (credentials: AdminRequestCredentials): boolean =>
	Boolean(credentials.authorization || credentials.cookie);

const isAuthError = (error: unknown): error is BackendApiError =>
	error instanceof BackendApiError && [401, 403].includes(error.status);

const isNotFound = (error: unknown): boolean =>
	error instanceof BackendApiError && error.status === 404;

const emptyUserList = { users: [], pagination: undefined };

const emptyUserDetails = {
	user: undefined,
	recentOrders: [],
	basket: { itemCount: 0, items: [], displaySubtotal: formatPrice(0) },
};

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(req: Request, res: Response): Promise<void> {
		const credentials = getCredentials(req);
		if (!hasCredentials(credentials)) {
			res.sendStatus(401);
			return;
		}

		try {
			const dashboard = await this.adminService.getDashboard(credentials);
			res.render("admin", dashboard);
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			res.status(503).render("admin", {
				error: "Admin data is temporarily unavailable. Please try again.",
				staff: { name: "" },
				sections: [],
				quickActions: [],
				cards: [],
				recentOrders: [],
				newUsers: [],
				stockChanges: [],
			});
		}
	}

	async getUsers(req: Request, res: Response): Promise<void> {
		const credentials = getCredentials(req);
		if (!hasCredentials(credentials)) {
			res.sendStatus(401);
			return;
		}

		const search =
			typeof req.query.q === "string"
				? req.query.q.trim().slice(0, MAX_SEARCH_LENGTH)
				: "";
		const requestedPage =
			typeof req.query.page === "string" ? Number(req.query.page) : 1;
		const page =
			Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

		try {
			const result: AdminUserListResponse = await this.adminService.getUsers(
				credentials,
				{ search, page },
			);
			res.render("admin-users", {
				search,
				users: (result.users ?? []).map(toUserView),
				pagination: this.toPaginationView(result, search),
			});
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			res.status(503).render("admin-users", {
				search,
				...emptyUserList,
				error: "User accounts are temporarily unavailable. Please try again.",
			});
		}
	}

	async getUserDetails(req: Request, res: Response): Promise<void> {
		const credentials = getCredentials(req);
		if (!hasCredentials(credentials)) {
			res.sendStatus(401);
			return;
		}

		const id = String(req.params.id ?? "");
		if (!USER_ID_PATTERN.test(id)) {
			this.renderUserNotFound(res);
			return;
		}

		try {
			const details: AdminUserDetailsResponse =
				await this.adminService.getUserById(credentials, id);
			const updated =
				req.query.updated === "suspended" || req.query.updated === "reactivated"
					? req.query.updated
					: undefined;
			res.render("admin-user-details", {
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
				updated,
				actionFailed: req.query.actionFailed === "1",
			});
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			if (isNotFound(error)) {
				this.renderUserNotFound(res);
				return;
			}
			res.status(503).render("admin-user-details", {
				...emptyUserDetails,
				userId: id,
				error: "User details are temporarily unavailable. Please try again.",
			});
		}
	}

	async postSuspendUser(req: Request, res: Response): Promise<void> {
		await this.changeStatus("suspend", req, res);
	}

	async postReactivateUser(req: Request, res: Response): Promise<void> {
		await this.changeStatus("reactivate", req, res);
	}

	private async changeStatus(
		action: "suspend" | "reactivate",
		req: Request,
		res: Response,
	): Promise<void> {
		const credentials = getCredentials(req);
		if (!hasCredentials(credentials)) {
			res.sendStatus(401);
			return;
		}

		const id = String(req.params.id ?? "");
		if (!USER_ID_PATTERN.test(id)) {
			this.renderUserNotFound(res);
			return;
		}

		const detailsPath = `/admin/users/${encodeURIComponent(id)}`;
		try {
			if (action === "suspend") {
				await this.adminService.suspendUser(credentials, id);
			} else {
				await this.adminService.reactivateUser(credentials, id);
			}
			res.redirect(
				303,
				`${detailsPath}?updated=${action === "suspend" ? "suspended" : "reactivated"}`,
			);
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			if (isNotFound(error)) {
				this.renderUserNotFound(res);
				return;
			}
			res.redirect(303, `${detailsPath}?actionFailed=1`);
		}
	}

	private renderUserNotFound(res: Response): void {
		res.status(404).render("admin-user-details", {
			...emptyUserDetails,
			notFound: true,
		});
	}

	private toPaginationView(result: AdminUserListResponse, search: string) {
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
	}
}
