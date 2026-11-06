import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const app = { name: "app" };
	const listen = vi.fn(
		(_port: number, _host: string, callback?: () => void) => {
			callback?.();
		},
	);
	const close = vi.fn();
	return {
		app,
		listen,
		close,
		createApp: vi.fn(() => app),
		createServer: vi.fn(() => ({
			server: { listen, close },
			protocol: "http" as "http" | "https",
		})),
	};
});

vi.mock("dotenv/config", () => ({}));
vi.mock("../app", () => ({ createApp: mocks.createApp }));
vi.mock("../server", () => ({ createServer: mocks.createServer }));

describe("index entrypoint", () => {
	let processOn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		processOn = vi.spyOn(process, "on").mockImplementation(() => process);
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("throws when PORT is not set", async () => {
		vi.stubEnv("PORT", undefined);

		await expect(import("../index")).rejects.toThrow(
			"PORT environment variable is not set",
		);
		expect(mocks.createApp).not.toHaveBeenCalled();
		expect(mocks.listen).not.toHaveBeenCalled();
	});

	it("throws when PORT is empty", async () => {
		vi.stubEnv("PORT", "");

		await expect(import("../index")).rejects.toThrow(
			"PORT environment variable is not set",
		);
	});

	it.each(["abc", "80.5", "-1", "65536"])(
		"throws for invalid PORT %s",
		async (port) => {
			vi.stubEnv("PORT", port);

			await expect(import("../index")).rejects.toThrow(`Invalid PORT: ${port}`);
			expect(mocks.createApp).not.toHaveBeenCalled();
		},
	);

	it("creates the app and listens on the configured port on all interfaces", async () => {
		vi.stubEnv("PORT", "4321");

		await import("../index");

		expect(mocks.createApp).toHaveBeenCalledTimes(1);
		expect(mocks.createServer).toHaveBeenCalledWith(mocks.app);
		expect(mocks.listen).toHaveBeenCalledWith(
			4321,
			"0.0.0.0",
			expect.any(Function),
		);
		expect(console.log).toHaveBeenCalledWith(
			"Listening on http://localhost:4321",
		);
	});

	it("logs the protocol reported by createServer", async () => {
		vi.stubEnv("PORT", "8443");
		mocks.createServer.mockReturnValueOnce({
			server: { listen: mocks.listen, close: mocks.close },
			protocol: "https",
		});

		await import("../index");

		expect(console.log).toHaveBeenCalledWith(
			"Listening on https://localhost:8443",
		);
	});

	it.each(["0", "65535"])("accepts boundary PORT %s", async (port) => {
		vi.stubEnv("PORT", port);

		await import("../index");

		expect(mocks.listen).toHaveBeenCalledWith(
			Number(port),
			"0.0.0.0",
			expect.any(Function),
		);
	});

	it.each(["SIGINT", "SIGTERM"] as const)(
		"closes the server and exits cleanly on %s",
		async (signal) => {
			vi.stubEnv("PORT", "3000");
			const exit = vi
				.spyOn(process, "exit")
				.mockImplementation(() => undefined as never);
			mocks.close.mockImplementation((callback?: () => void) => callback?.());

			await import("../index");

			const calls = processOn.mock.calls as Array<[string, () => void]>;
			const handler = calls.find(([event]) => event === signal)?.[1];
			expect(handler).toBeTypeOf("function");
			handler?.();
			expect(mocks.close).toHaveBeenCalledTimes(1);
			expect(exit).toHaveBeenCalledWith(0);
		},
	);
});
