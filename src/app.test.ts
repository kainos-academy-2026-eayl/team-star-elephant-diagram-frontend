import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

const app = createApp();

describe("app", () => {
	it("GET /health returns ok", async () => {
		const res = await request(app).get("/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
	});

	it.each([
		["/login", "Log in"],
		["/register", "Create your account"],
	])("GET %s renders the page", async (path, heading) => {
		expect(readdirSync("pages")).toContain(`${path.slice(1)}.njk`);

		const res = await request(app).get(path);

		expect(res.status).toBe(200);
		expect(res.text).toContain(heading);
	});

	it("serves the stylesheet", async () => {
		const res = await request(app).get("/styles.css");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("text/css");
	});
});
