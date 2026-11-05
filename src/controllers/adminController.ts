import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AdminUserStatusAction } from "../models/adminUser";
import type { AdminContext, AdminService } from "../services/adminService";
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
// 403 for staff is left to the caller, which renders the access denied page.
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
	if (error.status === 403) {
		return false;
	}
	const params = new URLSearchParams();
	if (error instanceof SessionExpiredError) {
		params.set("reason", "expired");
	}
	const target = safeAdminReturnTo(returnTo);
	if (target && target !== "/admin") {
		params.set("returnTo", target);
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
			const access = this.adminService.getRestrictedAccess();
			if (this.handleAuthError(error, req, res, access)) {
				return;
			}
			res.status(503).render("admin", {
				...access,
				error: "Admin data is temporarily unavailable. Please try again.",
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

		const { access, result } = await this.loadWithAccess(
			req,
			res,
			this.adminService.getUsers(req, res, { search, page }),
		);
		if (result.status === "fulfilled") {
			res.render("admin-users", {
				...access,
				search,
				...result.value,
				deleted: req.query.deleted === "1",
			});
			return;
		}
		const error: unknown = result.reason;
		if (this.handleAuthError(error, req, res, access)) {
			return;
		}
		res.status(503).render("admin-users", {
			...access,
			search,
			users: [],
			error: "User accounts are temporarily unavailable. Please try again.",
		});
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

		const { access, result } = await this.loadWithAccess(
			req,
			res,
			this.adminService.getUserById(req, res, id),
		);
		if (result.status === "fulfilled") {
			res.render("admin-user-details", {
				...access,
				...result.value,
				updated: this.adminService.parseStatusUpdate(req.query.updated),
				actionFailed: req.query.actionFailed === "1",
			});
			return;
		}
		const error: unknown = result.reason;
		if (this.handleAuthError(error, req, res, access)) {
			return;
		}
		if (isNotFound(error)) {
			this.renderUserNotFound(res, access);
			return;
		}
		res.status(503).render("admin-user-details", {
			...access,
			userId: id,
			error: "User details are temporarily unavailable. Please try again.",
		});
	}

	async postSuspendUser(req: Request, res: Response): Promise<void> {
		await this.performUserAction("suspend", req, res);
	}

	async postReactivateUser(req: Request, res: Response): Promise<void> {
		await this.performUserAction("reactivate", req, res);
	}

	async postDeleteUser(req: Request, res: Response): Promise<void> {
		await this.performUserAction("delete", req, res);
	}

	async getBaskets(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);

		const { access, result } = await this.loadWithAccess(
			req,
			res,
			this.adminService.getBaskets(req, res, search),
		);
		if (result.status === "fulfilled") {
			res.render("admin-baskets", { ...access, search, baskets: result.value });
			return;
		}
		const error: unknown = result.reason;
		if (this.handleAuthError(error, req, res, access)) {
			return;
		}
		res.status(503).render("admin-baskets", {
			...access,
			search,
			baskets: [],
			error: "Baskets are temporarily unavailable. Please try again.",
		});
	}

	async getBasketDetails(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderBasketNotFound(res);
			return;
		}

		const { access, result } = await this.loadWithAccess(
			req,
			res,
			this.adminService.getBasketById(req, res, id),
		);
		if (result.status === "fulfilled") {
			res.render("partials/admin-basket-details", {
				...access,
				basket: result.value,
				basketId: id,
			});
			return;
		}
		const error: unknown = result.reason;
		if (this.handleAuthError(error, req, res, access)) {
			return;
		}
		if (isNotFound(error)) {
			this.renderBasketNotFound(res, access);
			return;
		}
		res.status(503).render("partials/admin-basket-details", {
			...access,
			basketId: id,
			error: "Basket details are temporarily unavailable. Please try again.",
		});
	}

	async getOrders(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);
		const page = this.adminService.normalisePage(req.query.page);

		const { access, result } = await this.loadWithAccess(
			req, res, this.adminService.getOrders(req, res, { search, page }),
		);
		if (result.status === "fulfilled") {
			res.render("admin-orders", { ...access, search, ...result.value });
			return;
		}
		if (this.handleAuthError(result.reason, req, res, access)) return;
		res.status(503).render("admin-orders", {
			...access, search, orders: [],
			error: "Orders are temporarily unavailable. Please try again.",
		});
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

	private async performUserAction(
		action: AdminUserStatusAction | "delete",
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
		if (action === "delete" && req.body?.confirmDelete !== "yes") {
			res.status(400).render("admin-user-details", {
				...this.adminService.getRestrictedAccess(),
				userId: id,
				error: "Confirm permanent deletion before deleting this customer.",
			});
			return;
		}
		try {
			if (action === "delete") {
				await this.adminService.deleteUser(req, res, id);
				res.redirect(303, "/admin/users?deleted=1");
				return;
			}
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
			if (isAuthError(error)) {
				const access = await this.adminService
					.getAccess(req, res)
					.catch(() => this.adminService.getRestrictedAccess());
				this.renderForbidden(res, access);
				return;
			}
			if (isNotFound(error)) {
				this.renderUserNotFound(res);
				return;
			}
			console.error(`Admin user ${action} failed`, error);
			if (action === "delete") {
				res.status(503).render("admin-user-details", {
					...this.adminService.getRestrictedAccess(),
					userId: id,
					error: "The customer could not be deleted. Please try again.",
				});
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

	// Loads page data alongside the backend's role-scoped access so navigation and actions match the role.
	private async loadWithAccess<T>(
		req: Request,
		res: Response,
		page: Promise<T>,
	): Promise<{ access: AdminContext; result: PromiseSettledResult<T> }> {
		const [result, accessResult] = await Promise.allSettled([
			page,
			this.adminService.getAccess(req, res),
		]);
		if (accessResult.status === "fulfilled") {
			return { access: accessResult.value, result };
		}
		const access = this.adminService.getRestrictedAccess();
		const reason: unknown = accessResult.reason;
		const mustLeave =
			reason instanceof CustomerSessionError ||
			(reason instanceof BackendApiError && reason.status === 401);
		if (result.status === "fulfilled" && mustLeave) {
			return { access, result: { status: "rejected", reason } };
		}
		return { access, result };
	}

	private handleAuthError(
		error: unknown,
		req: Request,
		res: Response,
		access: AdminContext,
	): boolean {
		if (redirectToAdminLogin(error, req, res)) {
			return true;
		}
		if (isAuthError(error)) {
			this.renderForbidden(res, access);
			return true;
		}
		return false;
	}

	private renderForbidden(res: Response, access: AdminContext): void {
		res.status(403).render("admin", { ...access, forbidden: true });
	}

	private renderUserNotFound(res: Response, access?: AdminContext): void {
		res.status(404).render("admin-user-details", { ...access, notFound: true });
	}

	private renderBasketNotFound(res: Response, access?: AdminContext): void {
		res
			.status(404)
			.render("partials/admin-basket-details", { ...access, notFound: true });
	}

	private renderOrderNotFound(res: Response): void {
		res.status(404).render("admin-order-details", { notFound: true });
	}
}
