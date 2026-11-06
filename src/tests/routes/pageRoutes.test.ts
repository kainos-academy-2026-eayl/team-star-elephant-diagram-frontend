import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageController } from "../../controllers/pageController";
import { createPageRoutes } from "../../routes/pageRoutes";

describe("createPageRoutes", () => {
	const health = vi.fn((res: Response) => {
		res.status(200).send("health");
	});
	const home = vi.fn((_req: Request, res: Response) => {
		res.status(200).send("home");
	});
	let app: express.Express;

	beforeEach(() => {
		health.mockClear();
		home.mockClear();
		app = express();
		app.use(createPageRoutes({ health, home } as unknown as PageController));
	});

	it("GET /health calls health with the response only", async () => {
		const response = await request(app).get("/health");

		expect(response.status).toBe(200);
		expect(response.text).toBe("health");
		expect(health).toHaveBeenCalledTimes(1);
		expect(health.mock.calls[0]).toHaveLength(1);
		expect(home).not.toHaveBeenCalled();
	});

	it("GET / calls home", async () => {
		const response = await request(app).get("/");

		expect(response.status).toBe(200);
		expect(response.text).toBe("home");
		expect(home).toHaveBeenCalledTimes(1);
		expect(health).not.toHaveBeenCalled();
	});

	it.each([
		["post", "/"],
		["post", "/health"],
		["get", "/unknown"],
	] as const)("returns 404 for unmapped %s %s", async (method, path) => {
		const response = await request(app)[method](path);

		expect(response.status).toBe(404);
		expect(home).not.toHaveBeenCalled();
		expect(health).not.toHaveBeenCalled();
	});
});
