import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("app", () => {
	it("does not serve the removed legacy catalogue path", async () => {
		const res = await request(app).get("/product_catalogue");

		expect(res.status).toBe(404);
	});

	it("serves the stylesheet", async () => {
		const res = await request(app).get("/styles.css");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("text/css");
	});
});
