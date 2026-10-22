import type { Response } from "express";

export class PageController {
	health(res: Response): void {
		res.json({ status: "ok", uptime: process.uptime() });
	}

	home(res: Response): void {
		res.redirect("/login");
	}
}
