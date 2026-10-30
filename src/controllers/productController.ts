import type { Request, Response } from "express";
import type { ProductService } from "../services/productService";

const BASKET_MESSAGES: Record<string, { type: "error"; text: string }> = {
	invalid: { type: "error", text: "Please choose a valid quantity." },
	limit: {
		type: "error",
		text: "Your basket already holds the maximum quantity of this product.",
	},
	notfound: { type: "error", text: "This product is no longer available." },
	unavailable: {
		type: "error",
		text: "Your basket is temporarily unavailable. Please try again.",
	},
};

export const isValidProductId = (value: unknown): value is string =>
	typeof value === "string" &&
	/^[1-9]\d*$/.test(value) &&
	Number.isSafeInteger(Number(value));

export class ProductController {
	constructor(private readonly productService: ProductService) {}

	async getProduct(
		req: Request<{ productId: string }>,
		res: Response,
	): Promise<void> {
		const { productId } = req.params;
		if (!isValidProductId(productId)) {
			res.status(400).render("product_expanded", {
				error: "Invalid product ID.",
			});
			return;
		}

		try {
			const product = await this.productService.getProduct(Number(productId));
			if (product.productId !== Number(productId)) {
				throw new Error("Backend returned a different product");
			}
			const status =
				typeof req.query.basket === "string" ? req.query.basket : "";
			res.render("product_expanded", {
				product,
				basketMessage: BASKET_MESSAGES[status],
			});
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

	async getProducts(req: Request, res: Response): Promise<void> {
		const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
		const category =
			typeof req.query.category === "string" ? req.query.category : "";
		try {
			const products = await this.productService.getProducts();
			const categories = [
				...new Set(products.map((product) => product.category)),
			].sort();
			const filtered = products.filter(
				(product) =>
					(!category || product.category === category) &&
					`${product.name} ${product.category} ${product.description}`
						.toLowerCase()
						.includes(query.toLowerCase()),
			);
			res.render("product_catalogue", {
				products: filtered,
				categories: categories.map((name) => ({
					name,
					query: encodeURIComponent(name),
				})),
				query,
				category,
			});
		} catch {
			res.status(503).render("product_catalogue", {
				error: "Products are temporarily unavailable. Please try again.",
				query,
				category,
			});
		}
	}
}
