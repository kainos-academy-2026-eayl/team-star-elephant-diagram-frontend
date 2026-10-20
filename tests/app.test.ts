import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createApp } from "../src/app";

let server: Server;
let baseUrl: string;

before(async () => {
	server = createApp().listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
	if (server) {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
});

test("GET /health returns a healthy status and non-negative uptime", async () => {
	const response = await fetch(`${baseUrl}/health`);

	assert.equal(response.status, 200);
	assert.match(response.headers.get("content-type") ?? "", /application\/json/);
	const body = await response.json();
	assert.equal(body.status, "ok");
	assert.equal(typeof body.uptime, "number");
	assert.ok(body.uptime >= 0);
});

test("GET /unknown returns 404", async () => {
	const response = await fetch(`${baseUrl}/unknown`);

	assert.equal(response.status, 404);
});
