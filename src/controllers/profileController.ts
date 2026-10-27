import type { Request, Response } from "express";
import type { ProfileService } from "../services/profileService";

export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	async getProfile(_req: Request, res: Response): Promise<void> {
		try {
			const profile = await this.profileService.getProfile();
			res.render("profile", profile);
		} catch {
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
