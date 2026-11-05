import type { Request, Response } from "express";
import type { Basket } from "../services/basketService";
import type { SessionService } from "../services/sessionService";
import { basketCookieHeader } from "./basketController";

// The badge is decorative, so a missing session or backend failure just hides it.
export async function getCartCount(
	sessions: SessionService,
	req: Request,
	res: Response,
): Promise<number> {
	try {
		const basketCookie = basketCookieHeader(req);
		const basket = await sessions.request<Basket>(
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
