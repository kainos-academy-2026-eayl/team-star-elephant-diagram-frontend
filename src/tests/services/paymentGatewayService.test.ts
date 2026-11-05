import { describe, expect, it } from "vitest";
import { PaymentGatewayService } from "../../services/paymentGatewayService";

const payment = {
	nameOnCard: "Ada Lovelace",
	cardNumber: "4242 4242 4242 4242",
	expiry: "12/30",
	cvc: "123",
};
const shipping = {
	fullName: "Ada Lovelace",
	addressLine1: "1 Analytical Way",
	city: "London",
	postcode: "N1 1AA",
};
const success = {
	outcome: "success",
	paymentResult: {
		status: "processing",
		message: "Payment is being processed. Please do not refresh the page.",
	},
};

describe("PaymentGatewayService", () => {
	const service = new PaymentGatewayService();

	it("accepts valid payment and shipping details", async () => {
		await expect(service.submit({ ...payment, ...shipping })).resolves.toEqual(
			success,
		);
	});

	it.each(["4242424242424", "4242424242424242424"])(
		"accepts card number %s at the length boundaries",
		async (cardNumber) => {
			await expect(
				service.submit({ ...payment, ...shipping, cardNumber }),
			).resolves.toEqual(success);
		},
	);

	it("accepts a four digit security code", async () => {
		await expect(
			service.submit({ ...payment, ...shipping, cvc: "1234" }),
		).resolves.toEqual(success);
	});

	it.each(["missing body", ""])(
		"asks for all fields when the body is not an object (%s)",
		async (body) => {
			await expect(service.submit(body)).resolves.toEqual({
				outcome: "invalid",
				error: "Please fill in all required payment and shipping fields.",
			});
		},
	);

	it.each([
		["nameOnCard", "   ", "Please enter a valid name on card."],
		["nameOnCard", "a".repeat(51), "Please enter a valid name on card."],
		["cardNumber", "4242", "Please enter a valid card number."],
		["cardNumber", "4242-4242-4242-4242", "Please enter a valid card number."],
		["cardNumber", "4".repeat(20), "Please enter a valid card number."],
		["expiry", "1230", "Please enter a valid expiry date (MM/YY)."],
		["expiry", undefined, "Please enter a valid expiry date (MM/YY)."],
		["cvc", "12", "Please enter a valid security code."],
		["cvc", "12a", "Please enter a valid security code."],
		["fullName", "", "Please enter a valid full name."],
		["fullName", "a".repeat(101), "Please enter a valid full name."],
		["addressLine1", " ", "Please enter a valid street address."],
		["city", "a".repeat(51), "Please enter a valid city."],
		["postcode", 12345, "Please enter a valid postcode."],
		["postcode", "a".repeat(21), "Please enter a valid postcode."],
	])("rejects an invalid %s (%s)", async (field, value, error) => {
		await expect(
			service.submit({ ...payment, ...shipping, [field]: value }),
		).resolves.toEqual({ outcome: "invalid", error });
	});

	it.each(["true", true])(
		"skips shipping validation when useExistingAddress is %s",
		async (useExistingAddress) => {
			await expect(
				service.submit({ ...payment, useExistingAddress }),
			).resolves.toEqual(success);
		},
	);

	it("still validates payment fields when using the existing address", async () => {
		await expect(
			service.submit({ ...payment, cvc: "", useExistingAddress: "true" }),
		).resolves.toEqual({
			outcome: "invalid",
			error: "Please enter a valid security code.",
		});
	});

	it("requires shipping fields when useExistingAddress is not true", async () => {
		await expect(
			service.submit({ ...payment, useExistingAddress: "false" }),
		).resolves.toEqual({
			outcome: "invalid",
			error: "Please enter a valid full name.",
		});
	});
});
