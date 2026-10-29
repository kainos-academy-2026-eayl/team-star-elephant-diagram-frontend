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
		try {
			const productId = req.params.id;
			const productExpanded =
				await this.productExpandedService.getProductExpanded(productId);
			res.json(productExpanded);
		} catch (error) {
			if (error instanceof BackendApiError) {
				res.status(error.status).json({ message: error.message });
			} else {
				res.status(500).json({ message: "Internal server error" });
			}
		}
	}
}
