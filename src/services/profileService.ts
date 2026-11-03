import type { Request, Response } from "express";
import type { ProfileData } from "../models/profile";
import type { SessionService } from "./sessionService";

export class ProfileService {
	constructor(private readonly sessions: SessionService) {}

	getProfile(req: Request, res: Response): Promise<ProfileData> {
		return this.sessions.request<ProfileData>("/profile", req, res);
	}
}
