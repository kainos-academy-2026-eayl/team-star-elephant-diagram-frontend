import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AuthService } from "../services/authService";

export class AuthController {
	constructor(private readonly authService: AuthService) {}

	getLogin(req: Request, res: Response): void {
		res.render("login", { registered: req.query.registered === "1" });
	}

	getRegister(res: Response): void {
		res.render("register");
	}

	async postLogin(req: Request, res: Response): Promise<void> {
		await this.submit("login", req, res);
	}

	async postRegister(req: Request, res: Response): Promise<void> {
		await this.submit("register", req, res);
	}

	private async submit(
		page: "login" | "register",
		req: Request,
		res: Response,
	): Promise<void> {
		const fields =
			page === "register"
				? ["forename", "surname", "email", "password"]
				: ["email", "password"];
		const values: Record<string, string> = Object.fromEntries(
			fields.map((field) => [
				field,
				typeof req.body?.[field] === "string" ? req.body[field] : "",
			]),
		);
		const { password, ...safeValues } = values;
		if (page === "register" && password !== req.body?.confirmPassword) {
			res.status(400).render(page, {
				values: safeValues,
				error: "Passwords do not match.",
			});
			return;
		}

		try {
			if (page === "register") {
				await this.authService.register(values);
			} else {
				await this.authService.login(values);
			}
			res.redirect(
				303,
				page === "register" ? "/login?registered=1" : "/products",
			);
		} catch (error) {
			const rejected =
				error instanceof BackendApiError && [400, 401].includes(error.status);
			res.status(rejected ? error.status : 503).render(page, {
				values: safeValues,
				error: rejected
					? error.message
					: "The service is temporarily unavailable. Please try again.",
				details: rejected ? error.details : {},
			});
		}
	}
}
