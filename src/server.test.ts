import { Server as HttpServer } from "node:http";
import express from "express";
import { describe, expect, it } from "vitest";
import { createServer } from "./server";

describe("server transport", () => {
	it("keeps HTTP available behind a deployment TLS proxy when no certificate is configured", () => {
		const { server, protocol } = createServer(express(), {
			certFile: "",
			keyFile: "",
		});
		expect(protocol).toBe("http");
		expect(server).toBeInstanceOf(HttpServer);
	});

	it.each([
		{ certFile: "certificate.pem", keyFile: "" },
		{ certFile: "", keyFile: "key.pem" },
	])(
		"rejects incomplete TLS configuration instead of silently falling back to HTTP",
		(options) => {
			expect(() => createServer(express(), options)).toThrow(
				"must both be set",
			);
		},
	);

	it("fails explicitly when configured certificate files cannot be read", () => {
		expect(() =>
			createServer(express(), {
				certFile: "/nonexistent-star-elephant-cert.pem",
				keyFile: "/nonexistent-star-elephant-key.pem",
			}),
		).toThrow();
	});
});
