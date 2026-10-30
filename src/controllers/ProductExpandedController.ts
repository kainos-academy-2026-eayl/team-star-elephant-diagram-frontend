import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { ProductExpandedService } from "../services/ProductExpandedService";

export class ProductExpandedController {
	constructor(
		private readonly productExpandedService: ProductExpandedService,
	) {}

	async getProductExpanded(
		req: Request<{ id: string }>,
		res: Response,
	): Promise<void> {
		const productId = req.params.id;
		if (
			!/^[1-9]\d*$/.test(productId) ||
			!Number.isSafeInteger(Number(productId))
		) {
			res.status(400).render("product_expanded", {
				error: "Invalid product ID.",
			});
			return;
		}

		try {
			const product =
				await this.productExpandedService.getProductExpanded(productId);
			res.render("product_expanded", { product });
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 404) {
				res.status(404).render("product_expanded");
				return;
			}
			res.status(503).render("product_expanded", {
				error: "Product is temporarily unavailable. Please try again.",
			});
		}
	}
}
