import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentGatewayController } from "../../controllers/paymentGatewayController";
import { createPaymentGatewayRoutes } from "../../routes/paymentGatewayRoutes";

describe("createPaymentGatewayRoutes", () => {
	const show = vi.fn((_req: Request, res: Response) => {
		res.status(200).send("show");
	});
	const submit = vi.fn((req: Request, res: Response) => {
		res.status(200).json({ handler: "submit", body: req.body });
	});
	let app: express.Express;

	beforeEach(() => {
		show.mockClear();
		submit.mockClear();
		app = express();
		app.use(express.urlencoded({ extended: false }));
		app.use(
			createPaymentGatewayRoutes({
				show,
				submit,
			} as unknown as PaymentGatewayController),
		);
	});

	it("GET /payment_gateway calls show", async () => {
		const response = await request(app).get("/payment_gateway");

		expect(response.status).toBe(200);
		expect(response.text).toBe("show");
		expect(show).toHaveBeenCalledTimes(1);
		expect(submit).not.toHaveBeenCalled();
	});

	it("POST /payment_gateway calls submit with the request body", async () => {
		const response = await request(app)
			.post("/payment_gateway")
			.type("form")
			.send({ cardName: "A Shopper" });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			handler: "submit",
			body: { cardName: "A Shopper" },
		});
		expect(submit).toHaveBeenCalledTimes(1);
		expect(show).not.toHaveBeenCalled();
	});

	it.each([
		["put", "/payment_gateway"],
		["get", "/payment-gateway"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
	});
});
