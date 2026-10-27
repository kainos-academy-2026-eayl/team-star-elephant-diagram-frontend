import type { Request, Response } from "express";
import type { BasketService } from "../services/basketService";

const formatPrice = (amount: number): string =>
    new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
    }).format(amount);

export class BasketController {
    constructor(private readonly basketService: BasketService) { }

    async getBasket(_req: Request, res: Response): Promise<void> {
        try {
            const basket = await this.basketService.getBasket();
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
        } catch {
            res.status(503).render("basket", {
                error: "Your basket is temporarily unavailable. Please try again.",
            });
        }
    }
}
