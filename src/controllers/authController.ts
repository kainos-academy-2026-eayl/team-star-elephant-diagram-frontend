import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { AuthService } from "../services/authService";
import type { SessionService } from "../services/sessionService";

export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly sessions: SessionService,
	) {}

	getLogin(req: Request, res: Response): void {
		res.render("login", {
			admin: req.path === "/admin/login",
			registered: req.query.registered === "1",
			passwordReset: req.query.reset === "1",
		});
	}

	getRegister(res: Response): void {
		res.render("register");
	}

	async postLogin(req: Request, res: Response): Promise<void> {
		await this.submit("login", req, res);
	}

	async logout(req: Request, res: Response): Promise<void> {
		try {
			await this.sessions.logout(req, res);
			res.redirect(303, "/login");
		} catch (error) {
			console.error("Logout failed", error);
			res.status(503).send("Logout failed. Please try again.");
		}
	}

	async postRegister(req: Request, res: Response): Promise<void> {
		await this.submit("register", req, res);
	}

	getForgotPassword(req: Request, res: Response): void {
		res.render("forgot-password", { sent: req.query.sent === "1" });
	}

	getResetPassword(req: Request, res: Response): void {
		const token = typeof req.query.token === "string" ? req.query.token : "";
		const invalidToken = !/^[a-f0-9]{64}$/.test(token);
		res.status(invalidToken ? 400 : 200).render("reset-password", {
			values: { token: invalidToken ? "" : token },
			invalidToken,
			error: invalidToken
				? "This reset link is invalid. Please request a new one."
				: undefined,
		});
	}

	async postForgotPassword(req: Request, res: Response): Promise<void> {
		await this.submit("forgot-password", req, res);
	}

	async postResetPassword(req: Request, res: Response): Promise<void> {
		await this.submit("reset-password", req, res);
	}

	private async submit(
		page: "login" | "register" | "forgot-password" | "reset-password",
		req: Request,
		res: Response,
	): Promise<void> {
		const fields =
			page === "register"
				? ["forename", "surname", "email", "password"]
				: page === "forgot-password"
					? ["email"]
					: page === "reset-password"
						? ["token", "password"]
						: ["email", "password"];
		const values: Record<string, string> = Object.fromEntries(
			fields.map((field) => [
				field,
				typeof req.body?.[field] === "string" ? req.body[field] : "",
			]),
		);
		const { password, ...safeValues } = values;
		if (
			(page === "register" || page === "reset-password") &&
			password !== req.body?.confirmPassword
		) {
			res.status(400).render(page, {
				values: safeValues,
				error: "Passwords do not match.",
			});
			return;
		}

		try {
			if (page === "register") {
				await this.authService.register(values);
			} else if (page === "forgot-password") {
				await this.authService.forgotPassword(values);
			} else if (page === "reset-password") {
				await this.authService.resetPassword(values);
			} else {
				this.sessions.establish(
					res,
					await this.authService.login(values, req.path === "/admin/login"),
				);
			}
			const destinations = {
				register: "/login?registered=1",
				login: req.path === "/admin/login" ? "/admin" : "/products",
				"forgot-password": "/forgot-password?sent=1",
				"reset-password": "/login?reset=1",
			};
			res.redirect(303, destinations[page]);
		} catch (error) {
			const rejected =
				error instanceof BackendApiError && [400, 401].includes(error.status);
			res.status(rejected ? error.status : 503).render(page, {
				admin: req.path === "/admin/login",
				values: safeValues,
				error: rejected
					? error.message
					: "The service is temporarily unavailable. Please try again.",
				details: rejected ? error.details : {},
			});
		}
	}
}
