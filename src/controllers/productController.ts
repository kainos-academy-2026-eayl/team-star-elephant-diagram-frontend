import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { Product } from "../models/product";
import type { ProductService } from "../services/productService";

export class ProductController {
	constructor(private readonly productService: ProductService) {}

	async getProduct(
		req: Request<{ prodId: string }>,
		res: Response,
	): Promise<void> {
		const { prodId } = req.params;
		if (!/^[1-9]\d*$/.test(prodId) || !Number.isSafeInteger(Number(prodId))) {
			res.status(400).render("product_expanded", {
				error: "Invalid product ID.",
			});
			return;
		}

		try {
			const product = await this.productService.getProduct(Number(prodId));
			res.render("product_expanded", {
				product: this.formatProduct(product),
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
			const filtered = products
				.filter(
					(product) =>
						(!category || product.category === category) &&
						`${product.name} ${product.description}`
							.toLowerCase()
							.includes(query.toLowerCase()),
				)
				.map((product) => this.formatProduct(product));
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

	private formatProduct(product: Product) {
		return {
			...product,
			formattedPrice: new Intl.NumberFormat("en-GB", {
				style: "currency",
				currency: "GBP",
			}).format(product.price / 100),
			imageURL: /^https?:\/\//i.test(product.imageURL) ? product.imageURL : "",
		};
	}
}
