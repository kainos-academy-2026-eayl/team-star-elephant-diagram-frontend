import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { BackendApi } from "./backendApi";
import { AuthController } from "./controllers/authController";
import { PageController } from "./controllers/pageController";
import { ProductController } from "./controllers/productController";
import { ProfileController } from "./controllers/profileController";
import { createAuthRoutes } from "./routes/authRoutes";
import { createPageRoutes } from "./routes/pageRoutes";
import { createProductRoutes } from "./routes/productRoutes";
import { createProfileRoutes } from "./routes/profileRoutes";
import { AuthService } from "./services/authService";
import { ProductService } from "./services/productService";
import { ProfileService } from "./services/profileService";

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
	const profileController = new ProfileController(new ProfileService(api));

	nunjucks.configure("src/pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("src/pages"));
	app.use(express.urlencoded({ extended: false, limit: "100kb" }));

	app.get("/admin", (_req: Request, res: Response) => {
		res.render("admin", {
			staff: { name: "Staff member" },
			sections: [
				{ label: "Orders" },
				{ label: "Stock" },
				{ label: "Products" },
				{ label: "Users" },
				{ label: "Active Baskets" },
			],
			quickActions: [
				{ label: "Add product" },
				{ label: "Adjust stock" },
				{ label: "Update order status" },
				{ label: "Find user" },
			],
			cards: [
				{ label: "Orders today", value: "0" },
				{
					label: "Awaiting dispatch",
					value: "0",
				},
				{ label: "Low stock", value: "0" },
				{ label: "Active baskets", value: "0" },
				{ label: "Registered users", value: "0" },
				{ label: "Revenue this month", value: "£0.00" },
			],
			recentOrders: [],
			newUsers: [],
			stockChanges: [],
		});
	});

	app.use(createPageRoutes(pageController));
	app.use(createAuthRoutes(authController));
	app.use(createProductRoutes(productController));
	app.use(createProfileRoutes(profileController));

	return app;
}
