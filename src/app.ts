import path from "node:path";
import express, { type Express, type Request, type Response } from "express";

const PAGES_DIR = path.resolve(process.cwd(), "pages");

export function createApp(): Express {
	const app = express();

	app.get("/", (_req: Request, res: Response) => {
		res.redirect("/products");
	});

	app.get("/products", (_req: Request, res: Response) => {
		res.sendFile(path.join(PAGES_DIR, "productCatalogue.html"));
	});

	app.get("/login", (_req: Request, res: Response) => {
		res.sendFile(path.join(PAGES_DIR, "login.html"));
	});

	app.get("/productCatalogue.css", (_req: Request, res: Response) => {
		res.sendFile(path.join(PAGES_DIR, "productCatalogue.css"));
	});

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	return app;
}
