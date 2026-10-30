import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Express } from "express";

export function createServer(
	app: Express,
	{
		certFile = process.env.TLS_CERT_FILE,
		keyFile = process.env.TLS_KEY_FILE,
	}: { certFile?: string; keyFile?: string } = {},
) {
	if (Boolean(certFile) !== Boolean(keyFile)) {
		throw new Error(
			"TLS_CERT_FILE and TLS_KEY_FILE must both be set for HTTPS",
		);
	}
	if (certFile && keyFile) {
		return {
			protocol: "https",
			server: createHttpsServer(
				{ cert: readFileSync(certFile), key: readFileSync(keyFile) },
				app,
			),
		} as const;
	}
	return { protocol: "http", server: createHttpServer(app) } as const;
}
