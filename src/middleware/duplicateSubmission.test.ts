import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { preventDuplicateSubmissions } from "./duplicateSubmission";

const TOKEN = "3f2c1a9e-6b7d-4c8e-9f10-112233445566";

function fixture(options: Parameters<typeof preventDuplicateSubmissions>[0]) {
	const handled = vi.fn();
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const app = express();
	app.use(express.urlencoded({ extended: false }));
	app.use(preventDuplicateSubmissions(options));
	app.post("/action", async (req, res) => {
		handled(req.body);
		await gate;
		res.redirect(303, `/done?run=${handled.mock.calls.length}`);
	});
	const submit = (cookie = "session=a") =>
		request(app)
			.post("/action")
			.set("Cookie", cookie)
			.type("form")
			.send({ _submission: TOKEN, value: "1" });
	return { handled, release, submit };
}

describe("preventDuplicateSubmissions", () => {
	it("replays the first response even when the first request was aborted", async () => {
		const { handled, release, submit } = fixture({});
		const aborted = submit();
		aborted.timeout(20).catch(() => {});
		await vi.waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 40));
		const duplicate = submit();
		setTimeout(release, 20);
		const res = await duplicate;
		expect(handled).toHaveBeenCalledTimes(1);
		expect(handled).toHaveBeenCalledWith({ value: "1" });
		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/done?run=1");
	});

	it("does not share submissions between sessions", async () => {
		const { handled, release, submit } = fixture({});
		release();
		await submit("session=a");
		await submit("session=b");
		expect(handled).toHaveBeenCalledTimes(2);
	});

	it("allows the token again once the de-duplication window has passed", async () => {
		let time = 0;
		const { handled, release, submit } = fixture({
			windowMs: 1000,
			now: () => time,
		});
		release();
		await submit();
		time = 500;
		expect((await submit()).headers.location).toBe("/done?run=1");
		time = 1001;
		expect((await submit()).headers.location).toBe("/done?run=2");
		expect(handled).toHaveBeenCalledTimes(2);
	});
});
