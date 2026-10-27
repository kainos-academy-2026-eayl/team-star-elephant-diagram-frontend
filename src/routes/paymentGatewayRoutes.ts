import { Router } from "express";
import type { PaymentGatewayController } from "../controllers/paymentGatewayController";

export function createPaymentGatewayRoutes(
	paymentGatewayController: PaymentGatewayController,
): Router {
	const router = Router();

	router.get("/payment_gateway", (req, res) =>
		paymentGatewayController.show(req, res),
	);
	router.post("/payment_gateway", (req, res) =>
		paymentGatewayController.submit(req, res),
	);

	return router;
}
