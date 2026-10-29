import type { Request, Response } from "express";
import { BackendApi } from "../api/BackendApi";
import type { ProductExpandedService } from "../services/ProductExpandedService";

export class ProductExpandedController {
    constructor(private readonly productExpandedService: ProductExpandedService) {}

    async getProductExpanded(
        req: Request<{ id: string }>,
        res: Response
    ): Promise<void> {
        const productId = req.params.id;
        const productExpanded = await this.productExpandedService.getProductExpanded(productId);
        res.json(productExpanded);
    }

   
}