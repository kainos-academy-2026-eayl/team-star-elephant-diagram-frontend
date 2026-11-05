import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { BasketAction } from "../models/adminBasket";
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

const BASKET_NOTICES: Record<string, string> = {
	created: "Basket created.",
	exists: "This customer already has a basket.",
	added: "Product added to the basket.",
	updated: "Quantity updated.",
	removed: "Product removed from the basket.",
	cleared: "Basket emptied.",
	deleted: "Basket deleted.",
};

const BASKET_ACTION_PERMISSION = {
	add: "update",
	update: "update",
	remove: "update",
	clear: "update",
	delete: "delete",
} as const satisfies Record<BasketAction, "update" | "delete">;

const BASKET_ACTION_NOTICE: Record<Exclude<BasketAction, "delete">, string> = {
	add: "added",
	update: "updated",
	remove: "removed",
	clear: "cleared",
};

const noticeFrom = (value: unknown): string | undefined =>
	typeof value === "string" ? BASKET_NOTICES[value] : undefined;

const MAX_EMAIL_LENGTH = 255;

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
			res.render("admin-baskets", {
				...access,
				search,
				baskets: result.value,
				notice: noticeFrom(req.query.notice),
			});
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
				...result.value,
				basketId: id,
				notice: noticeFrom(req.query.notice),
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

	async postCreateBasket(req: Request, res: Response): Promise<void> {
		if (!this.checkMutation(req, res)) return;
		const rawEmail: unknown = req.body?.email;
		const email =
			typeof rawEmail === "string"
				? rawEmail.trim().slice(0, MAX_EMAIL_LENGTH + 1)
				: "";
		let access = this.adminService.getRestrictedAccess();
		try {
			access = await this.adminService.getAccess(req, res);
			if (!access.basketPermissions.create) {
				this.renderForbidden(res, access);
				return;
			}
			if (!email || email.length > MAX_EMAIL_LENGTH) {
				throw new BackendApiError(400, "Enter the customer's email address.");
			}
			const basketId = await this.adminService.createBasket(req, res, email);
			res.redirect(
				303,
				`${this.adminService.getBasketDetailsHref(basketId)}?notice=created`,
			);
		} catch (error) {
			if (this.handleAuthError(error, req, res, access, "/admin/baskets")) {
				return;
			}
			if (error instanceof BackendApiError && error.status === 409) {
				const params = new URLSearchParams({ q: email, notice: "exists" });
				res.redirect(303, `/admin/baskets?${params}`);
				return;
			}
			const rejected =
				error instanceof BackendApiError && [400, 404].includes(error.status);
			if (!rejected) console.error("Admin basket creation failed", error);
			const baskets = await this.adminService
				.getBaskets(req, res)
				.catch(() => []);
			res.status(rejected ? error.status : 503).render("admin-baskets", {
				...access,
				search: "",
				baskets,
				createEmail: email,
				createError: rejected
					? error.message
					: "The basket could not be created. Please try again.",
			});
		}
	}

	async postAddBasketItem(req: Request, res: Response): Promise<void> {
		await this.performBasketAction("add", req, res);
	}

	async postUpdateBasketItem(req: Request, res: Response): Promise<void> {
		await this.performBasketAction("update", req, res);
	}

	async postRemoveBasketItem(req: Request, res: Response): Promise<void> {
		await this.performBasketAction("remove", req, res);
	}

	async postClearBasket(req: Request, res: Response): Promise<void> {
		await this.performBasketAction("clear", req, res);
	}

	async postDeleteBasket(req: Request, res: Response): Promise<void> {
		await this.performBasketAction("delete", req, res);
	}

	async getOrders(req: Request, res: Response): Promise<void> {
		if (this.redirectCustomer(req, res)) {
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);
		const page = this.adminService.normalisePage(req.query.page);

		const { access, result } = await this.loadWithAccess(
			req,
			res,
			this.adminService.getOrders(req, res, { search, page }),
		);
		if (result.status === "fulfilled") {
			res.render("admin-orders", { ...access, search, ...result.value });
			return;
		}
		if (this.handleAuthError(result.reason, req, res, access)) return;
		res.status(503).render("admin-orders", {
			...access,
			search,
			orders: [],
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

	// Shared guard for state-changing basket requests; returns false once a response has been sent.
	private checkMutation(req: Request, res: Response): boolean {
		if (
			!this.adminService.isSameOrigin(
				req.get("origin"),
				req.get("host"),
				req.protocol,
			)
		) {
			res.sendStatus(403);
			return false;
		}
		return !this.redirectCustomer(req, res);
	}

	private async performBasketAction(
		action: BasketAction,
		req: Request,
		res: Response,
	): Promise<void> {
		if (!this.checkMutation(req, res)) return;
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderBasketNotFound(res);
			return;
		}
		const detailsPath = this.adminService.getBasketDetailsHref(id);
		let access = this.adminService.getRestrictedAccess();
		try {
			access = await this.adminService.getAccess(req, res);
			if (!access.basketPermissions[BASKET_ACTION_PERMISSION[action]]) {
				this.renderForbidden(res, access);
				return;
			}
			const productId = this.adminService.parsePositiveInt(
				action === "add" ? req.body?.productId : req.params.productId,
			);
			const quantity = this.adminService.parsePositiveInt(req.body?.quantity);
			if (["add", "update", "remove"].includes(action) && !productId) {
				throw new BackendApiError(400, "Choose a product.");
			}
			if ((action === "add" || action === "update") && !quantity) {
				throw new BackendApiError(400, "Enter a quantity of at least 1.");
			}
			if (
				(action === "clear" || action === "delete") &&
				req.body?.confirm !== "yes"
			) {
				throw new BackendApiError(
					400,
					action === "clear"
						? "Confirm before emptying this basket."
						: "Confirm before deleting this basket.",
				);
			}
			switch (action) {
				case "add":
					await this.adminService.addBasketItem(
						req,
						res,
						id,
						productId as number,
						quantity as number,
					);
					break;
				case "update":
					await this.adminService.updateBasketItem(
						req,
						res,
						id,
						productId as number,
						quantity as number,
					);
					break;
				case "remove":
					await this.adminService.removeBasketItem(
						req,
						res,
						id,
						productId as number,
					);
					break;
				case "clear":
					await this.adminService.clearBasket(req, res, id);
					break;
				case "delete":
					await this.adminService.deleteBasket(req, res, id);
					res.redirect(303, "/admin/baskets?notice=deleted");
					return;
			}
			res.redirect(
				303,
				`${detailsPath}?notice=${BASKET_ACTION_NOTICE[action]}`,
			);
		} catch (error) {
			if (this.handleAuthError(error, req, res, access, detailsPath)) {
				return;
			}
			if (
				error instanceof BackendApiError &&
				error.status === 404 &&
				error.message === "Basket not found"
			) {
				this.renderBasketNotFound(res, access);
				return;
			}
			// Validation, stock and missing-item errors are shown on the basket so the admin can correct them.
			const rejected =
				error instanceof BackendApiError &&
				[400, 404, 409].includes(error.status);
			if (!rejected) console.error(`Admin basket ${action} failed`, error);
			const page = await this.adminService
				.getBasketById(req, res, id)
				.catch(() => undefined);
			res
				.status(rejected ? error.status : 503)
				.render("partials/admin-basket-details", {
					...access,
					...page,
					basketId: id,
					...(page
						? {
								actionError: rejected
									? error.message
									: "The basket could not be updated. Please try again.",
							}
						: {
								error:
									"Basket details are temporarily unavailable. Please try again.",
							}),
				});
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
		returnTo?: string,
	): boolean {
		if (redirectToAdminLogin(error, req, res, returnTo)) {
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
