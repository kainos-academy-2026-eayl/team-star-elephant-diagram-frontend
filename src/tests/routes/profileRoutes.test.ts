import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileController } from "../../controllers/profileController";
import { createProfileRoutes } from "../../routes/profileRoutes";

describe("createProfileRoutes", () => {
	const getProfile = vi.fn((_req: Request, res: Response) => {
		res.status(200).send("getProfile");
	});
	let app: express.Express;

	beforeEach(() => {
		getProfile.mockClear();
		app = express();
		app.use(
			createProfileRoutes({ getProfile } as unknown as ProfileController),
		);
	});

	it("GET /profile calls getProfile", async () => {
		const response = await request(app).get("/profile");

		expect(response.status).toBe(200);
		expect(response.text).toBe("getProfile");
		expect(getProfile).toHaveBeenCalledTimes(1);
	});

	it.each([
		["post", "/profile"],
		["get", "/profile/orders"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
		expect(getProfile).not.toHaveBeenCalled();
	});
});
