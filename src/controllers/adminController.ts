import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AdminUserStatusAction } from "../models/adminUser";
import type {
	AdminRequestCredentials,
	AdminService,
} from "../services/adminService";

const isAuthError = (error: unknown): error is BackendApiError =>
	error instanceof BackendApiError && [401, 403].includes(error.status);

const isNotFound = (error: unknown): boolean =>
	error instanceof BackendApiError && error.status === 404;

export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	async getDashboard(req: Request, res: Response): Promise<void> {
		const credentials = this.getCredentials(req);
		if (!credentials) {
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
		const credentials = this.getCredentials(req);
		if (!credentials) {
			res.sendStatus(401);
			return;
		}
		const search = this.adminService.normaliseSearch(req.query.q);
		const page = this.adminService.normalisePage(req.query.page);

		try {
			const userList = await this.adminService.getUsers(credentials, {
				search,
				page,
			});
			res.render("admin-users", { search, ...userList });
		} catch (error) {
			if (isAuthError(error)) {
				res.sendStatus(error.status);
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
		const credentials = this.getCredentials(req);
		if (!credentials) {
			res.sendStatus(401);
			return;
		}
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderUserNotFound(res);
			return;
		}

		try {
			const userDetails = await this.adminService.getUserById(credentials, id);
			res.render("admin-user-details", {
				...userDetails,
				updated: this.adminService.parseStatusUpdate(req.query.updated),
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

	private async changeUserStatus(
		action: AdminUserStatusAction,
		req: Request,
		res: Response,
	): Promise<void> {
		const credentials = this.getCredentials(req);
		if (!credentials) {
			res.sendStatus(401);
			return;
		}
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
		const id = String(req.params.id ?? "");
		if (!this.adminService.isValidId(id)) {
			this.renderUserNotFound(res);
			return;
		}

		const detailsPath = `/admin/users/${encodeURIComponent(id)}`;
		try {
			const updated = await this.adminService.changeUserStatus(
				credentials,
				id,
				action,
			);
			res.redirect(303, `${detailsPath}?updated=${updated}`);
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

	private getCredentials(req: Request): AdminRequestCredentials | undefined {
		return this.adminService.resolveCredentials(
			req.get("authorization"),
			req.get("cookie"),
		);
	}

	private renderUserNotFound(res: Response): void {
		res.status(404).render("admin-user-details", { notFound: true });
	}
}
