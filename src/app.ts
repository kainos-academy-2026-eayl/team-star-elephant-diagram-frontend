import express, { type Express } from "express";
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

	app.use(createPageRoutes(pageController));
	app.use(createAuthRoutes(authController));
	app.use(createProductRoutes(productController));

	return app;
}
