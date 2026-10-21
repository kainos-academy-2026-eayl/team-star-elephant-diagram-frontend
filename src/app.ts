import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { BackendApi, BackendApiError, type Product } from "./backendApi";

export function createApp({
	apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001",
	fetch: fetchApi = fetch,
}: {
	apiBaseUrl?: string;
	fetch?: typeof fetch;
} = {}): Express {
	const app = express();
	const api = new BackendApi(apiBaseUrl, fetchApi);

	nunjucks.configure("pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("pages"));
	app.use(express.urlencoded({ extended: false, limit: "100kb" }));

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	app.get("/", (_req: Request, res: Response) => {
		res.redirect("/login");
	});

	app.get("/login", (req: Request, res: Response) => {
		res.render("login", { registered: req.query.registered === "1" });
	});

	app.get("/register", (_req: Request, res: Response) => {
		res.render("register");
	});

	for (const page of ["login", "register"] as const) {
		app.post(`/${page}`, async (req: Request, res: Response) => {
			const fields =
				page === "register"
					? ["forename", "surname", "email", "password"]
					: ["email", "password"];
			const values = Object.fromEntries(
				fields.map((field) => [
					field,
					typeof req.body?.[field] === "string" ? req.body[field] : "",
				]),
			);
			const { password, ...safeValues } = values;
			if (page === "register" && password !== req.body?.confirmPassword) {
				res.status(400).render(page, {
					values: safeValues,
					error: "Passwords do not match.",
				});
				return;
			}
			try {
				await api.request(`/${page}`, values);
				res.redirect(
					303,
					page === "register" ? "/login?registered=1" : "/products",
				);
			} catch (error) {
				const rejected =
					error instanceof BackendApiError && [400, 401].includes(error.status);
				res.status(rejected ? error.status : 503).render(page, {
					values: safeValues,
					error: rejected
						? error.message
						: "The service is temporarily unavailable. Please try again.",
					details: rejected ? error.details : {},
				});
			}
		});
	}

	app.get("/product_catalogue", (_req: Request, res: Response) => {
		res.redirect("/products");
	});

	app.get("/products", async (req: Request, res: Response) => {
		const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
		const category =
			typeof req.query.category === "string" ? req.query.category : "";
		try {
			const products = await api.request<Product[]>("/product_catalogue");
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
					}).format(product.price),
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
	});
	return app;
}
