import express, { type Express } from "express";
import nunjucks from "nunjucks";
import { BackendApi } from "./backendApi";
import { AdminController } from "./controllers/adminController";
import { AuthController } from "./controllers/authController";
import { BasketController } from "./controllers/basketController";
import { PageController } from "./controllers/pageController";
import { PaymentGatewayController } from "./controllers/paymentGatewayController";
import { ProductController } from "./controllers/productController";
import { ProfileController } from "./controllers/profileController";
import { createAdminRoutes } from "./routes/adminRoutes";
import { createAuthRoutes } from "./routes/authRoutes";
import { createBasketRoutes } from "./routes/basketRoutes";
import { createPageRoutes } from "./routes/pageRoutes";
import { createPaymentGatewayRoutes } from "./routes/paymentGatewayRoutes";
import { createProductRoutes } from "./routes/productRoutes";
import { createProfileRoutes } from "./routes/profileRoutes";
import { AdminService } from "./services/adminService";
import { AuthService } from "./services/authService";
import { BasketService } from "./services/basketService";
import { PaymentGatewayService } from "./services/paymentGatewayService";
import { ProductService } from "./services/productService";
import { ProfileService } from "./services/profileService";
import { SessionService } from "./services/sessionService";

export function createApp({
	apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001",
	trustedProxy = process.env.TRUSTED_PROXY,
	fetch: fetchApi = fetch,
}: {
	apiBaseUrl?: string;
	trustedProxy?: string;
	fetch?: typeof fetch;
} = {}): Express {
	const app = express();
	if (trustedProxy) {
		app.set("trust proxy", trustedProxy);
	}
	const api = new BackendApi(apiBaseUrl, fetchApi);
	const sessions = new SessionService(api);
	const authController = new AuthController(new AuthService(api), sessions);
	const adminController = new AdminController(new AdminService(api, sessions));
	const basketController = new BasketController(new BasketService(sessions));
	const pageController = new PageController();
	const productService = new ProductService(api);
	const productController = new ProductController(productService);
	const paymentGatewayController = new PaymentGatewayController(
		new PaymentGatewayService(productService),
		new BasketService(sessions),
	);
	const profileController = new ProfileController(new ProfileService(sessions));

	nunjucks.configure("src/pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("src/pages"));
	app.use(express.static("src/styles"));
	app.use(express.json({ limit: "100kb" }));
	app.use(express.urlencoded({ extended: false, limit: "100kb" }));

	app.use(createPageRoutes(pageController));
	app.use(createAdminRoutes(adminController));
	app.use(createAuthRoutes(authController));
	app.use(createBasketRoutes(basketController));
	app.use(createProductRoutes(productController));
	app.use(createPaymentGatewayRoutes(paymentGatewayController));
	app.use(createProfileRoutes(profileController));

	return app;
}
