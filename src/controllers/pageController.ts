import type { Request, Response } from "express";
import type { SessionService } from "../services/sessionService";
import { getCartCount } from "./cartCount";

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

export class PageController {
	constructor(private readonly sessions: SessionService) {}

	health(res: Response): void {
		res.json({ status: "ok", uptime: process.uptime() });
	}

	async home(req: Request, res: Response): Promise<void> {
		const cartCount = await getCartCount(this.sessions, req, res);
		res.render("home", {
			slides,
			smallTiles,
			largeTiles,
			cartCount,
		});
	}
}
