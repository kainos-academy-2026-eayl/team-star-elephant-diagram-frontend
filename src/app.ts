import express, { type Express } from "express";
import nunjucks from "nunjucks";
import { BackendApi } from "./backendApi";
import { AdminController } from "./controllers/adminController";
import { AuthController } from "./controllers/authController";
import { BasketController } from "./controllers/basketController";
import { ProductExpandedController } from "./controllers/ProductExpandedController";
import { PageController } from "./controllers/pageController";
import { ProductController } from "./controllers/productController";
import { ProfileController } from "./controllers/profileController";
import { createAdminRoutes } from "./routes/adminRoutes";
import { createAuthRoutes } from "./routes/authRoutes";
import { createBasketRoutes } from "./routes/basketRoutes";
import { createProductExpandedRoutes } from "./routes/ProductExpandedRoutes";
import { createPageRoutes } from "./routes/pageRoutes";
import { createProductRoutes } from "./routes/productRoutes";
import { createProfileRoutes } from "./routes/profileRoutes";
import { AdminService } from "./services/adminService";
import { AuthService } from "./services/authService";
import { BasketService } from "./services/basketService";
import { ProductExpandedService } from "./services/ProductExpandedService";
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
	const adminController = new AdminController(new AdminService(api));
	const basketController = new BasketController(new BasketService(api));
	const pageController = new PageController();
	const productController = new ProductController(new ProductService(api));
	const productExpandedController = new ProductExpandedController(
		new ProductExpandedService(api),
	);
	const profileController = new ProfileController(new ProfileService(api));

	nunjucks.configure("src/pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("src/pages"));
	app.use(express.static("src/styles"));
	app.use(express.urlencoded({ extended: false, limit: "100kb" }));

	app.use(createPageRoutes(pageController));
	app.use(createAdminRoutes(adminController));
	app.use(createAuthRoutes(authController));
	app.use(createBasketRoutes(basketController));
	app.use(createProductRoutes(productController));
	app.use(createProductExpandedRoutes(productExpandedController));
	app.use(createProfileRoutes(profileController));

	return app;
}
