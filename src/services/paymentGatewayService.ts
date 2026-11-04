export interface PaymentFormData {
	nameOnCard: string;
	cardNumber: string;
	expiry: string;
	cvc: string;
}

export interface ShippingAddressData {
	fullName: string;
	addressLine1: string;
	addressLine2?: string;
	city: string;
	postcode: string;
}

export interface PaymentSubmissionData {
	payment: PaymentFormData;
	shipping: ShippingAddressData;
	useExistingAddress?: boolean;
}

export interface PaymentSuccessResult {
	status: string;
	message: string;
}

type PaymentSubmissionResult =
	| { outcome: "success"; paymentResult: PaymentSuccessResult }
	| { outcome: "invalid"; error: string }
	| { outcome: "unavailable"; error: string };

class PaymentValidationError extends Error {}

export class PaymentGatewayService {
	constructor() {}

	async submit(body: unknown): Promise<PaymentSubmissionResult> {
		try {
			const useExisting =
				(body as Record<string, unknown>).useExistingAddress === "true" ||
				(body as Record<string, unknown>).useExistingAddress === true;

			if (!useExisting) {
				const validatedData = this.validatePaymentData(body);
				if (!validatedData) {
					return {
						outcome: "invalid",
						error: "Please fill in all required payment and shipping fields.",
					};
				}
			} else {
				// Validate only payment fields when using existing address
				if (!this.validatePaymentDataOnly(body)) {
					return {
						outcome: "invalid",
						error: "Please fill in all required payment fields.",
					};
				}
			}

			return {
				outcome: "success",
				paymentResult: {
					status: "processing",
					message:
						"Payment is being processed. Please do not refresh the page.",
				},
			};
		} catch (error) {
			if (error instanceof PaymentValidationError) {
				return { outcome: "invalid", error: error.message };
			}
			return {
				outcome: "unavailable",
				error:
					"Payment processing is temporarily unavailable. Please try again.",
			};
		}
	}

	private validatePaymentDataOnly(body: unknown): boolean {
		if (!body || typeof body !== "object") {
			return false;
		}

		const data = body as Record<string, unknown>;

		const nameOnCard = data.nameOnCard;
		const cardNumber = data.cardNumber;
		const expiry = data.expiry;
		const cvc = data.cvc;

		if (
			typeof nameOnCard !== "string" ||
			nameOnCard.trim().length === 0 ||
			nameOnCard.length > 50
		) {
			throw new PaymentValidationError("Please enter a valid name on card.");
		}

		if (
			typeof cardNumber !== "string" ||
			!/^\d{13,19}$/.test(cardNumber.replace(/\s/g, ""))
		) {
			throw new PaymentValidationError("Please enter a valid card number.");
		}

		if (typeof expiry !== "string" || !/^\d{2}\/\d{2}$/.test(expiry.trim())) {
			throw new PaymentValidationError(
				"Please enter a valid expiry date (MM/YY).",
			);
		}

		if (typeof cvc !== "string" || !/^\d{3,4}$/.test(cvc.trim())) {
			throw new PaymentValidationError("Please enter a valid security code.");
		}

		return true;
	}

	private validatePaymentData(body: unknown): boolean {
		if (!body || typeof body !== "object") {
			return false;
		}

		const data = body as Record<string, unknown>;

		// Validate payment fields
		const nameOnCard = data.nameOnCard;
		const cardNumber = data.cardNumber;
		const expiry = data.expiry;
		const cvc = data.cvc;

		if (
			typeof nameOnCard !== "string" ||
			nameOnCard.trim().length === 0 ||
			nameOnCard.length > 50
		) {
			throw new PaymentValidationError("Please enter a valid name on card.");
		}

		if (
			typeof cardNumber !== "string" ||
			!/^\d{13,19}$/.test(cardNumber.replace(/\s/g, ""))
		) {
			throw new PaymentValidationError("Please enter a valid card number.");
		}

		if (typeof expiry !== "string" || !/^\d{2}\/\d{2}$/.test(expiry.trim())) {
			throw new PaymentValidationError(
				"Please enter a valid expiry date (MM/YY).",
			);
		}

		if (typeof cvc !== "string" || !/^\d{3,4}$/.test(cvc.trim())) {
			throw new PaymentValidationError("Please enter a valid security code.");
		}

		// Validate shipping address fields
		const fullName = data.fullName;
		const addressLine1 = data.addressLine1;
		const city = data.city;
		const postcode = data.postcode;

		if (
			typeof fullName !== "string" ||
			fullName.trim().length === 0 ||
			fullName.length > 100
		) {
			throw new PaymentValidationError("Please enter a valid full name.");
		}

		if (
			typeof addressLine1 !== "string" ||
			addressLine1.trim().length === 0 ||
			addressLine1.length > 100
		) {
			throw new PaymentValidationError("Please enter a valid street address.");
		}

		if (
			typeof city !== "string" ||
			city.trim().length === 0 ||
			city.length > 50
		) {
			throw new PaymentValidationError("Please enter a valid city.");
		}

		if (
			typeof postcode !== "string" ||
			postcode.trim().length === 0 ||
			postcode.length > 20
		) {
			throw new PaymentValidationError("Please enter a valid postcode.");
		}

		return true;
	}
}
