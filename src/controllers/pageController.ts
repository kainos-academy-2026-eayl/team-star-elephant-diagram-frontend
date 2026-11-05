import type { Request, Response } from "express";
import type { Basket } from "../services/basketService";
import type { SessionService } from "../services/sessionService";
import { basketCookieHeader } from "./basketController";

// Placeholder hrefs until category pages exist
const PLACEHOLDER_HREF = "/products";
const img = (name: string) => `/images/home/${name}.png`;

const slides = [
	{
		image: img("slide"),
		label: "Featured merchandise",
		href: PLACEHOLDER_HREF,
	},
	{
		image: img("slide"),
		label: "Featured merchandise",
		href: PLACEHOLDER_HREF,
	},
	{
		image: img("slide"),
		label: "Featured merchandise",
		href: PLACEHOLDER_HREF,
	},
];

const smallTiles = [
	{ image: img("home-living"), label: "Home & Living", href: PLACEHOLDER_HREF },
	{ image: img("fashion"), label: "Fashion", href: PLACEHOLDER_HREF },
	{
		image: img("sports-fitness"),
		label: "Sports & Fitness",
		href: PLACEHOLDER_HREF,
	},
	{ image: img("pet-care"), label: "Pet Care", href: PLACEHOLDER_HREF },
];

const largeTiles = [
	{ image: img("winter-shop"), label: "Winter Shop", href: PLACEHOLDER_HREF },
	{
		image: img("electronics-shop"),
		label: "Electronics Shop",
		href: PLACEHOLDER_HREF,
	},
];

const menuCategories = [
	{ label: "Shop All", icon: "grid", href: PLACEHOLDER_HREF },
	{ label: "Winter Shop", icon: "snowflake", href: PLACEHOLDER_HREF },
	{ label: "Electronics Shop", icon: "headphones", href: PLACEHOLDER_HREF },
	{ label: "Home & Living", icon: "house", href: PLACEHOLDER_HREF },
	{ label: "Fashion", icon: "hanger", href: PLACEHOLDER_HREF },
];

export class PageController {
	constructor(private readonly sessions: SessionService) {}

	health(res: Response): void {
		res.json({ status: "ok", uptime: process.uptime() });
	}

	async home(req: Request, res: Response): Promise<void> {
		const cartCount = await this.cartCount(req, res);
		res.render("home", {
			slides,
			smallTiles,
			largeTiles,
			menuCategories,
			cartCount,
		});
	}

	// The badge is decorative, so a missing session or backend failure just hides it.
	private async cartCount(req: Request, res: Response): Promise<number> {
		try {
			const basketCookie = basketCookieHeader(req);
			const basket = await this.sessions.request<Basket>(
				"/basket",
				req,
				res,
				basketCookie ? { Cookie: basketCookie } : {},
			);
			return basket.items.reduce((count, item) => count + item.quantity, 0);
		} catch {
			return 0;
		}
	}
}
