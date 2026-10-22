import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { BackendApi } from "./backendApi";
import { AuthController } from "./controllers/authController";
import { PageController } from "./controllers/pageController";
import { ProductController } from "./controllers/productController";
import { createAuthRoutes } from "./routes/authRoutes";
import { createPageRoutes } from "./routes/pageRoutes";
import { createProductRoutes } from "./routes/productRoutes";
import { AuthService } from "./services/authService";
import { ProductService } from "./services/productService";

export function createApp({
	apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001",
	fetch: fetchApi = fetch,
}: {
	apiBaseUrl?: string;
	fetch?: typeof fetch;
} = {}): Express {
	const app = express();
	const api = new BackendApi(apiBaseUrl, fetchApi);
	const authController = new AuthController(new AuthService(api));
	const pageController = new PageController();
	const productController = new ProductController(new ProductService(api));

	nunjucks.configure("pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("pages"));
	app.use(express.urlencoded({ extended: false, limit: "100kb" }));

	app.get("/admin", (_req: Request, res: Response) => {
		res.render("admin", {
			staff: { name: "Staff member" },
			sections: [
				{ label: "Orders", href: "/admin/orders" },
				{ label: "Stock", href: "/admin/stock" },
				{ label: "Products", href: "/admin/products" },
				{ label: "Users", href: "/admin/users" },
				{ label: "Active Baskets", href: "/admin/baskets" },
			],
			quickActions: [
				{ label: "Add product", href: "/admin/products/new" },
				{ label: "Adjust stock", href: "/admin/stock" },
				{ label: "Update order status", href: "/admin/orders" },
				{ label: "Find user", href: "/admin/users" },
			],
			cards: [
				{ label: "Orders today", value: "0", href: "/admin/orders?date=today" },
				{
					label: "Awaiting dispatch",
					value: "0",
					href: "/admin/orders?status=Processing",
				},
				{ label: "Low stock", value: "0", href: "/admin/stock?filter=low" },
				{ label: "Active baskets", value: "0", href: "/admin/baskets" },
				{ label: "Registered users", value: "0", href: "/admin/users" },
				{ label: "Revenue this month", value: "£0.00", href: "/admin/reports" },
			],
			recentOrders: [],
			newUsers: [],
			stockChanges: [],
		});
	});

	app.use(createPageRoutes(pageController));
	app.use(createAuthRoutes(authController));
	app.use(createProductRoutes(productController));

	return app;
}
