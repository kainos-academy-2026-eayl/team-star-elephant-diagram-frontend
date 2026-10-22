import type { Request, Response } from "express";
import type { ProductService } from "../services/productService";

export class ProductController {
	constructor(private readonly productService: ProductService) {}

	async getProducts(req: Request, res: Response): Promise<void> {
		const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
		const category =
			typeof req.query.category === "string" ? req.query.category : "";
		try {
			const products = await this.productService.getProducts();
			const categories = [
				...new Set(products.map((product) => product.category)),
			].sort();
			const filtered = products
				.filter(
					(product) =>
						(!category || product.category === category) &&
						`${product.name} ${product.description}`
							.toLowerCase()
							.includes(query.toLowerCase()),
				)
				.map((product) => ({
					...product,
					formattedPrice: new Intl.NumberFormat("en-GB", {
						style: "currency",
						currency: "GBP",
					}).format(product.price / 100),
					imageURL: /^https?:\/\//i.test(product.imageURL)
						? product.imageURL
						: "",
				}));
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
