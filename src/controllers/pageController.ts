import type { Response } from "express";

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

const menuGroups = [
	{
		label: "Shop All",
		icon: "grid",
		href: PLACEHOLDER_HREF,
		linkLabel: "Browse all products",
	},
	{
		label: "Winter Shop",
		icon: "snowflake",
		href: PLACEHOLDER_HREF,
		linkLabel: "Browse Winter Shop",
	},
	{
		label: "Electronics Shop",
		icon: "headphones",
		href: PLACEHOLDER_HREF,
		linkLabel: "Browse Electronics Shop",
	},
	{
		label: "Home & Living",
		icon: "house",
		href: PLACEHOLDER_HREF,
		linkLabel: "Browse Home & Living",
	},
	{
		label: "Fashion",
		icon: "hanger",
		href: PLACEHOLDER_HREF,
		linkLabel: "Browse Fashion",
	},
];

export class PageController {
	health(res: Response): void {
		res.json({ status: "ok", uptime: process.uptime() });
	}

	home(res: Response): void {
		res.render("home", { slides, smallTiles, largeTiles, menuGroups });
	}
}
