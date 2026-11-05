import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AdminUserStatusAction } from "../models/adminUser";
import type {
	AdminRequestCredentials,
	AdminService,
} from "../services/adminService";
import {
	CustomerSessionError,
	SessionExpiredError,
} from "../services/sessionService";
import { safeAdminReturnTo } from "../validators/returnTo";

const isAuthError = (error: unknown): error is BackendApiError =>
	error instanceof BackendApiError && [401, 403].includes(error.status);

const isNotFound = (error: unknown): boolean =>
	error instanceof BackendApiError && error.status === 404;

const ADMIN_LOGIN_PATH = "/admin/login";
const CUSTOMER_HOME_PATH = "/products";

// 401 → admin login (with returnTo, and reason=expired only when a refresh token was rejected).
// 403 → admin login with reason=forbidden (staff without permission).
const redirectToAdminLogin = (
	error: unknown,
	req: Request,
	res: Response,
	returnTo: string = req.originalUrl,
): boolean => {
	if (error instanceof CustomerSessionError) {
		res.redirect(303, CUSTOMER_HOME_PATH);
		return true;
	}
	if (!isAuthError(error)) {
		return false;
	}
	const params = new URLSearchParams();
	if (error.status === 403) {
		params.set("reason", "forbidden");
	} else {
		if (error instanceof SessionExpiredError) {
			params.set("reason", "expired");
		}
		const target = safeAdminReturnTo(returnTo);
		if (target && target !== "/admin") {
			params.set("returnTo", target);
		}
	}
	const query = params.toString();
	res.redirect(303, `${ADMIN_LOGIN_PATH}${query ? `?${query}` : ""}`);
	return true;
};

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		try {
			const dashboard = await this.adminService.getDashboard(req, res);
			res.render("admin", dashboard);
		} catch (error) {
			if (redirectToAdminLogin(error, req, res)) {
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
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);
		const page = this.adminService.normalisePage(req.query.page);

		try {
			const userList = await this.adminService.getUsers(req, res, {
				search,
				page,
			});
			res.render("admin-users", { search, ...userList });
		} catch (error) {
			if (redirectToAdminLogin(error, req, res)) {
				return;
			}
			res.status(503).render("admin-users", {
				search,
				users: [],
				error: "User accounts are temporarily unavailable. Please try again.",
			});
		}
	}

	async getUserDetails(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderUserNotFound(res);
			return;
		}

		try {
			const userDetails = await this.adminService.getUserById(req, res, id);
			res.render("admin-user-details", {
				...userDetails,
				updated: this.adminService.parseStatusUpdate(req.query.updated),
				actionFailed: req.query.actionFailed === "1",
			});
		} catch (error) {
			if (redirectToAdminLogin(error, req, res)) {
				return;
			}
			if (isNotFound(error)) {
				this.renderUserNotFound(res);
				return;
			}
			res.status(503).render("admin-user-details", {
				userId: id,
				error: "User details are temporarily unavailable. Please try again.",
			});
		}
	}

	async postSuspendUser(req: Request, res: Response): Promise<void> {
		await this.changeUserStatus("suspend", req, res);
	}

	async postReactivateUser(req: Request, res: Response): Promise<void> {
		await this.changeUserStatus("reactivate", req, res);
	}

	async getBaskets(req: Request, res: Response): Promise<void> {
		const credentials = this.getCredentials(req);
		if (!credentials) {
			res.sendStatus(401);
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);

		try {
			const baskets = await this.adminService.getBaskets(credentials, search);
			res.render("admin-baskets", { search, baskets });
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			res.status(503).render("admin-baskets", {
				search,
				baskets: [],
				error: "Baskets are temporarily unavailable. Please try again.",
			});
		}
	}

	async getBasketDetails(req: Request, res: Response): Promise<void> {
		const credentials = this.getCredentials(req);
		if (!credentials) {
			res.sendStatus(401);
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderBasketNotFound(res);
			return;
		}

		try {
			const basket = await this.adminService.getBasketById(credentials, id);
			res.render("admin-basket-details", { basket, basketId: id });
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
				return;
			}
			if (isNotFound(error)) {
				this.renderBasketNotFound(res);
				return;
			}
			res.status(503).render("admin-basket-details", {
				basketId: id,
				error: "Basket details are temporarily unavailable. Please try again.",
			});
		}
	}

	async getOrders(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);
		const page = this.adminService.normalisePage(req.query.page);

		try {
			const orderList = await this.adminService.getOrders(req, res, {
				search,
				page,
			});
			res.render("admin-orders", { search, ...orderList });
		} catch (error) {
			if (redirectToAdminLogin(error, req, res)) {
				return;
			}
			res.status(503).render("admin-orders", {
				search,
				orders: [],
				error: "Orders are temporarily unavailable. Please try again.",
			});
		}
	}

	async getOrderDetails(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderOrderNotFound(res);
			return;
		}

		try {
			const orderDetails = await this.adminService.getOrderById(req, res, id);
			const updated = this.adminService.isOrderStatus(req.query.updated)
				? this.adminService.formatOrderStatus(req.query.updated)
				: undefined;
			res.render("admin-order-details", {
				...orderDetails,
				updated,
				statusError: this.adminService.parseOrderStatusError(
					req.query.statusError,
				),
			});
		} catch (error) {
			if (redirectToAdminLogin(error, req, res)) {
				return;
			}
			if (isNotFound(error)) {
				this.renderOrderNotFound(res);
				return;
			}
			res.status(503).render("admin-order-details", {
				orderId: id,
				error: "Order details are temporarily unavailable. Please try again.",
			});
		}
	}

	async postOrderStatus(req: Request, res: Response): Promise<void> {
		if (
			!this.adminService.isSameOrigin(
				req.get("origin"),
				req.get("host"),
				req.protocol,
			)
		) {
			res.sendStatus(403);
			return;
		}
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderOrderNotFound(res);
			return;
		}

		const detailsPath = this.adminService.getOrderDetailsHref(id);
		const rawStatus: unknown = req.body?.status;
		const status =
			typeof rawStatus === "string" ? rawStatus.trim().toUpperCase() : "";
		if (!this.adminService.isOrderStatus(status)) {
			res.redirect(303, `${detailsPath}?statusError=invalid`);
			return;
		}

		try {
			const updated = await this.adminService.updateOrderStatus(
				req,
				res,
				id,
				status,
			);
			res.redirect(303, `${detailsPath}?updated=${updated}`);
		} catch (error) {
			// Staff without orders:update stay on the order with a message instead of being sent to login.
			if (
				!(error instanceof CustomerSessionError) &&
				error instanceof BackendApiError &&
				error.status === 403
			) {
				res.redirect(303, `${detailsPath}?statusError=forbidden`);
				return;
			}
			if (redirectToAdminLogin(error, req, res, detailsPath)) {
				return;
			}
			if (isNotFound(error)) {
				this.renderOrderNotFound(res);
				return;
			}
			const reason =
				error instanceof BackendApiError && error.status === 400
					? "invalid"
					: "failed";
			res.redirect(303, `${detailsPath}?statusError=${reason}`);
		}
	}

	private async changeUserStatus(
		action: AdminUserStatusAction,
		req: Request,
		res: Response,
	): Promise<void> {
		if (
			!this.adminService.isSameOrigin(
				req.get("origin"),
				req.get("host"),
				req.protocol,
			)
		) {
			res.sendStatus(403);
			return;
		}
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderUserNotFound(res);
			return;
		}

		const detailsPath = this.adminService.getUserDetailsHref(id);
		try {
			const updated = await this.adminService.changeUserStatus(
				req,
				res,
				id,
				action,
			);
			res.redirect(303, `${detailsPath}?updated=${updated}`);
		} catch (error) {
			if (redirectToAdminLogin(error, req, res, detailsPath)) {
				return;
			}
			if (isNotFound(error)) {
				this.renderUserNotFound(res);
				return;
			}
			res.redirect(303, `${detailsPath}?actionFailed=1`);
		}
	}

	// Customer sessions are sent back to the shop so they are never logged out or shown the staff login.
	private redirectCustomer(req: Request, res: Response): boolean {
		if (!this.adminService.isCustomerSession(req)) {
			return false;
		}
		res.redirect(303, CUSTOMER_HOME_PATH);
		return true;
	}

	private getCredentials(req: Request): AdminRequestCredentials | undefined {
		return this.adminService.resolveCredentials(
			req.get("authorization"),
			req.get("cookie"),
		);
	}

	private renderUserNotFound(res: Response): void {
		res.status(404).render("admin-user-details", { notFound: true });
	}

	private renderBasketNotFound(res: Response): void {
		res.status(404).render("admin-basket-details", { notFound: true });
	}

	private renderOrderNotFound(res: Response): void {
		res.status(404).render("admin-order-details", { notFound: true });
	}
}
