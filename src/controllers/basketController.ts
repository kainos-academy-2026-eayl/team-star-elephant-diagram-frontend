import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type {
	Basket,
	BasketRequestCredentials,
	BasketService,
} from "../services/basketService";
import type { SessionService } from "../services/sessionService";
import { isValidProductId } from "./productController";

const MAX_ITEM_QUANTITY = 99;
const BASKET_COOKIE = "basketId";
const BASKET_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const formatPrice = (amount: number): string =>
	new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency: "GBP",
	}).format(amount);

const readCredentials = (req: Request): BasketRequestCredentials => {
	const authorization = req.get("authorization");
	const cookie = req.get("cookie");
	return {
		...(authorization ? { authorization } : {}),
		...(cookie ? { cookie } : {}),
	};
};

export class BasketController {
	constructor(
		private readonly basketService: BasketService,
		private readonly sessions: SessionService,
	) {}

	async addItem(req: Request, res: Response): Promise<void> {
		const body = (req.body ?? {}) as Record<string, unknown>;
		const productId = body.productId;
		if (!isValidProductId(productId)) {
			res.redirect(303, "/products");
			return;
		}
		const productPath = `/products/${productId}`;
		const quantityText =
			typeof body.quantity === "string" && body.quantity.trim() !== ""
				? body.quantity.trim()
				: "1";
		const quantity = Number(quantityText);
		if (
			!/^\d+$/.test(quantityText) ||
			quantity < 1 ||
			quantity > MAX_ITEM_QUANTITY
		) {
			res.redirect(303, `${productPath}?basket=invalid`);
			return;
		}

		try {
			const { cookies } = await this.basketService.addItem(
				Number(productId),
				quantity,
				readCredentials(req),
			);
			for (const setCookie of cookies) {
				const pair = setCookie.split(";", 1)[0]?.trim() ?? "";
				if (pair.startsWith(`${BASKET_COOKIE}=`)) {
					res.append(
						"Set-Cookie",
						`${pair}; Path=/; Max-Age=${BASKET_COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
					);
				}
			}
			res.redirect(303, "/basket");
		} catch (error) {
			const status =
				error instanceof BackendApiError
					? error.status === 404
						? "notfound"
						: error.status === 400
							? /exceed/i.test(error.message)
								? "limit"
								: "invalid"
							: "unavailable"
					: "unavailable";
			res.redirect(303, `${productPath}?basket=${status}`);
		}
	}

	async getBasket(req: Request, res: Response): Promise<void> {
		const authorization = req.get("authorization");
		const cookie = req.get("cookie");
		if (!authorization && !cookie) {
			res.status(401).render("basket", {
				error: "Please log in to view your basket.",
				loginRequired: true,
				basket: { items: [], itemCount: 0, displaySubtotal: formatPrice(0) },
			});
			return;
		}

		try {
			const basket = await this.sessions.request<Basket>("/basket", req, res);
			const items = basket.items.map((item) => ({
				...item,
				imageURL: /^https?:\/\//i.test(item.imageURL ?? "")
					? item.imageURL
					: "",
				displayUnitPrice: formatPrice(item.unitPrice),
				displaySubtotal: formatPrice(item.unitPrice * item.quantity),
			}));
			res.render("basket", {
				basket: {
					items,
					itemCount: items.reduce((count, item) => count + item.quantity, 0),
					displaySubtotal: formatPrice(basket.subtotal),
				},
			});
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401) {
				res.status(401).render("basket", {
					error: "Please log in to view your basket.",
					loginRequired: true,
					basket: { items: [], itemCount: 0, displaySubtotal: formatPrice(0) },
				});
				return;
			}
			res.status(503).render("basket", {
				error: "Your basket is temporarily unavailable. Please try again.",
				basket: { items: [], itemCount: 0, displaySubtotal: formatPrice(0) },
			});
		}
	}
}
