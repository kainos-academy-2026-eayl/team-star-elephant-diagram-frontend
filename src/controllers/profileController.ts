import type { Request, Response } from "express";
import { BackendApiError } from "../backendApi";
import type { ProfileService } from "../services/profileService";

export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	async getProfile(req: Request, res: Response): Promise<void> {
		try {
			const profile = await this.profileService.getProfile(req, res);
			res.render("profile", profile);
		} catch (error) {
			if (error instanceof BackendApiError && error.status === 401) {
				res.redirect(303, "/login");
				return;
			}
			res.status(503).render("profile", {
				user: {
					firstName: "",
					lastName: "",
					email: "",
					memberSince: "",
				},
				orders: [],
				error: "Your profile is temporarily unavailable. Please try again.",
			});
		}
	}
}
