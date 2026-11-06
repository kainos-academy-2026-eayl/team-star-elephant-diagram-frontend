import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutController } from "../../controllers/checkoutController";
import { createCheckoutRoutes } from "../../routes/checkoutRoutes";

describe("createCheckoutRoutes", () => {
	const show = vi.fn((_req: Request, res: Response) => {
		res.status(200).send("show");
	});
	let app: express.Express;

	beforeEach(() => {
		show.mockClear();
		app = express();
		app.use(createCheckoutRoutes({ show } as unknown as CheckoutController));
	});

	it("GET /checkout calls show", async () => {
		const response = await request(app).get("/checkout");

		expect(response.status).toBe(200);
		expect(response.text).toBe("show");
		expect(show).toHaveBeenCalledTimes(1);
	});

	it.each([
		["post", "/checkout"],
		["get", "/checkout/extra"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
		expect(show).not.toHaveBeenCalled();
	});
});
