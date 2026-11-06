import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { BackendApiError } from "../../backendApi";
import type { ProfileData } from "../../models/profile";
import { ProfileService } from "../../services/profileService";
import type { SessionService } from "../../services/sessionService";

const profile: ProfileData = {
	user: {
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		memberSince: "2026-01-01",
	},
	orders: [],
};

const setup = () => {
	const request = vi.fn();
	const sessions = { request } as unknown as SessionService;
	return { request, service: new ProfileService(sessions) };
};

describe("ProfileService", () => {
	const req = {} as Request;
	const res = {} as Response;

	it("loads the profile through the authenticated session", async () => {
		const { request, service } = setup();
		request.mockResolvedValueOnce(profile);

		await expect(service.getProfile(req, res)).resolves.toBe(profile);

		expect(request).toHaveBeenCalledExactlyOnceWith("/profile", req, res);
	});

	it("propagates session errors", async () => {
		const { request, service } = setup();
		const error = new BackendApiError(401, "Please log in.");
		request.mockRejectedValueOnce(error);

		await expect(service.getProfile(req, res)).rejects.toBe(error);
	});
});
