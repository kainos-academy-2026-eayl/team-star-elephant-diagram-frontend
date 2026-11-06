import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { InventoryPermissions } from "../models/inventory";
import type { AdminContext, AdminService } from "../services/adminService";
import type { InventoryService } from "../services/inventoryService";
import {
	CustomerSessionError,
	SessionExpiredError,
} from "../services/sessionService";
import { safeAdminReturnTo } from "../validators/returnTo";

const ROOT = "/admin/inventory";
const NOTICES: Record<string, string> = {
	created: "Product created.",
	updated: "Product updated.",
	deleted: "Product deleted.",
	stock: "Stock adjusted.",
	threshold: "Low stock threshold updated.",
};

export class InventoryController {
	constructor(
		private readonly inventory: InventoryService,
		private readonly admins: AdminService,
	) {}

	list = async (req: Request, res: Response): Promise<void> => {
		await this.run(req, res, "view", async (access) => {
			const query = this.inventory.query(req);
			const result = await this.inventory.list(req, res, query);
			res.render("admin-inventory", {
				...access,
				...query,
				...result,
				notice:
					typeof req.query.notice === "string"
						? NOTICES[req.query.notice]
						: undefined,
			});
		});
	};

	details = async (req: Request, res: Response): Promise<void> => {
		await this.run(req, res, "view", async (access, id) => {
			const product = await this.inventory.details(req, res, id);
			const history = await this.inventory.history(req, res, id);
			res.render("admin-inventory-details", {
				...access,
				product,
				history,
				notice:
					typeof req.query.notice === "string"
						? NOTICES[req.query.notice]
						: undefined,
			});
		});
	};

	createForm = async (req: Request, res: Response): Promise<void> => {
		await this.run(req, res, "create", async (access) => {
			res.render("admin-inventory-form", {
				...access,
				suppliers: await this.inventory.suppliers(req, res),
				values: { stockQuantity: "0", lowStockThreshold: "5" },
			});
		});
	};

	editForm = async (req: Request, res: Response): Promise<void> => {
		await this.run(req, res, "update", async (access, id) => {
			const product = await this.inventory.details(req, res, id);
			res.render("admin-inventory-form", {
				...access,
				editing: true,
				productId: id,
				values: product,
			});
		});
	};

	create = async (req: Request, res: Response): Promise<void> => {
		const values = this.inventory.values(req);
		const page = {
			template: "admin-inventory-form",
			data: { values } as Record<string, unknown>,
		};
		await this.run(
			req,
			res,
			"create",
			async (_access) => {
				page.data.suppliers = await this.inventory.suppliers(req, res);
				const product = await this.inventory.save(req, res, values);
				res.redirect(303, `${ROOT}/${product.productId}?notice=created`);
			},
			page,
		);
	};

	update = async (req: Request, res: Response): Promise<void> => {
		const values = this.inventory.values(req);
		await this.run(
			req,
			res,
			"update",
			async (_access, id) => {
				await this.inventory.save(req, res, values, id);
				res.redirect(303, `${ROOT}/${id}?notice=updated`);
			},
			{
				template: "admin-inventory-form",
				data: { values, editing: true, productId: req.params.id },
			},
		);
	};

	adjust = async (req: Request, res: Response): Promise<void> => {
		await this.stockAction(req, res, "stock");
	};

	threshold = async (req: Request, res: Response): Promise<void> => {
		await this.stockAction(req, res, "threshold");
	};

	delete = async (req: Request, res: Response): Promise<void> => {
		await this.run(req, res, "delete", async (_access, id) => {
			if (req.body?.confirmDelete !== "yes")
				throw new BackendApiError(
					400,
					"Confirm deletion before deleting this product.",
				);
			await this.inventory.delete(req, res, id);
			res.redirect(303, `${ROOT}?notice=deleted`);
		});
	};

	private async stockAction(
		req: Request,
		res: Response,
		action: "stock" | "threshold",
	): Promise<void> {
		const page = {
			template: "admin-inventory-details",
			data: {} as Record<string, unknown>,
		};
		await this.run(
			req,
			res,
			"update",
			async (_access, id) => {
				page.data.product = await this.inventory.details(req, res, id);
				page.data.history = await this.inventory.history(req, res, id);
				page.data.values = this.inventory.values(req);
				if (action === "stock")
					await this.inventory.adjust(req, res, id, this.inventory.values(req));
				else
					await this.inventory.threshold(
						req,
						res,
						id,
						this.inventory.values(req),
					);
				res.redirect(303, `${ROOT}/${id}?notice=${action}`);
			},
			page,
		);
	}

	private async run(
		req: Request,
		res: Response,
		permission: keyof InventoryPermissions,
		operation: (access: AdminContext, id: string) => Promise<void>,
		page = { template: "admin-inventory", data: {} as Record<string, unknown> },
	): Promise<void> {
		let access = this.admins.getRestrictedAccess();
		if (this.admins.isCustomerSession(req)) {
			res.redirect(303, "/products");
			return;
		}
		try {
			if (
				req.method !== "GET" &&
				!this.admins.isSameOrigin(
					req.get("origin"),
					req.get("host"),
					req.protocol,
				)
			) {
				throw new BackendApiError(403, "Invalid request origin.");
			}
			access = await this.admins.getAccess(req, res);
			if (
				!access.inventoryPermissions.view ||
				!access.inventoryPermissions[permission]
			) {
				throw new BackendApiError(403, "Inventory permission required.");
			}
			const id = String(req.params.id ?? "");
			if (id && (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2_147_483_647)) {
				throw new BackendApiError(404, "Product not found.");
			}
			await operation(access, id);
		} catch (error) {
			if (error instanceof CustomerSessionError) {
				res.redirect(303, "/products");
				return;
			}
			if (error instanceof BackendApiError && error.status === 401) {
				const params = new URLSearchParams();
				const target = safeAdminReturnTo(
					req.method === "GET" ? req.originalUrl : ROOT,
				);
				if (target) params.set("returnTo", target);
				if (error instanceof SessionExpiredError)
					params.set("reason", "expired");
				res.redirect(303, `/admin/login?${params}`);
				return;
			}
			if (error instanceof BackendApiError && error.status === 403) {
				res.status(403).render("admin", { ...access, forbidden: true });
				return;
			}
			if (error instanceof BackendApiError && error.status === 404) {
				res.status(404).render("admin-inventory", {
					...access,
					error: "Product not found.",
					notFound: true,
				});
				return;
			}
			const rejected =
				error instanceof BackendApiError &&
				[400, 409, 429].includes(error.status);
			if (!rejected) console.error("Admin inventory request failed", error);
			res.status(rejected ? error.status : 503).render(page.template, {
				...access,
				...page.data,
				error: rejected
					? error.message
					: "Inventory is temporarily unavailable. Please try again.",
				errors: rejected ? error.details : {},
			});
		}
	}
}
