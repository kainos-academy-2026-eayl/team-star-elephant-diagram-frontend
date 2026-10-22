import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";

export function createApp(): Express {
	const app = express();

	nunjucks.configure("pages", {
		autoescape: true,
		express: app,
	});

	app.set("view engine", "njk");

	app.use(express.static("pages"));

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	app.get("/", (_req: Request, res: Response) => {
		res.redirect("/login");
	});

	app.get("/login", (_req: Request, res: Response) => {
		res.render("login");
	});

	app.get("/register", (_req: Request, res: Response) => {
		res.render("register");
	});

	app.get("/products", (_req: Request, res: Response) => {
		res.render("product_catalogue");
	});

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

	app.get("/profile", (_req: Request, res: Response) => {
		res.render("profile");
	});

	return app;
}
