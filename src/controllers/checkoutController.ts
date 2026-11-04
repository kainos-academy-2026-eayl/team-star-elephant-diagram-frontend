import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { Basket } from "../services/basketService";
import type { CheckoutService } from "../services/checkoutService";
import type { SessionService } from "../services/sessionService";

const readCookie = (req: Request, name: string): string | undefined => {
	const matches = (req.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part.startsWith(`${name}=`));
	if (matches.length !== 1) return undefined;
	const value = matches[0]?.slice(name.length + 1);
	return value && /^[A-Za-z0-9._-]+$/.test(value) ? value : undefined;
};

export class CheckoutController {
	constructor(
		private readonly checkoutService: CheckoutService,
		private readonly sessions: SessionService,
	) {}

	async show(req: Request, res: Response): Promise<void> {
		const authorization = req.get("authorization");
		if (
			!authorization &&
			!readCookie(req, "accessToken") &&
			!readCookie(req, "refreshToken")
		) {
			res.status(401).render("checkout", {
				error: "Please log in to proceed to checkout.",
				loginRequired: true,
				checkout: null,
			});
			return;
		}

		try {
			const basketId = readCookie(req, "basketId");
			const basket = await this.sessions.request<Basket>(
				"/basket",
				req,
				res,
				basketId ? { Cookie: `basketId=${basketId}` } : {},
			);

			if (!basket || basket.items.length === 0) {
				res.render("checkout", {
					error: "Your basket is empty. Add some products first.",
					checkout: null,
				});
				return;
			}

			const checkoutData = await this.checkoutService.prepareCheckout(basket);
			res.render("checkout", { checkout: checkoutData, error: null });
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401) {
				res.status(401).render("checkout", {
					error: "Please log in to proceed to checkout.",
					loginRequired: true,
					checkout: null,
				});
				return;
			}
			res.status(503).render("checkout", {
				error: "Checkout is temporarily unavailable. Please try again.",
				checkout: null,
			});
		}
	}
}
