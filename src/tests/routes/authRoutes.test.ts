import type { Request, Response } from "express";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthController } from "../../controllers/authController";
import { createAuthRoutes } from "../../routes/authRoutes";

function createStub() {
	const handle =
		(name: string) =>
		(_req: Request, res: Response, admin?: boolean): void => {
			res.status(200).json({ handler: name, admin: admin ?? null });
		};
	return {
		getLogin: vi.fn(handle("getLogin")),
		getRegister: vi.fn((res: Response) => {
			res.status(200).json({ handler: "getRegister", admin: null });
		}),
		postLogin: vi.fn(handle("postLogin")),
		logout: vi.fn(handle("logout")),
		postRegister: vi.fn(handle("postRegister")),
		getForgotPassword: vi.fn(handle("getForgotPassword")),
		postForgotPassword: vi.fn(handle("postForgotPassword")),
		getResetPassword: vi.fn(handle("getResetPassword")),
		postResetPassword: vi.fn(handle("postResetPassword")),
	};
}

describe("createAuthRoutes", () => {
	let stub: ReturnType<typeof createStub>;
	let app: express.Express;

	beforeEach(() => {
		stub = createStub();
		app = express();
		app.use(express.urlencoded({ extended: false }));
		app.use(createAuthRoutes(stub as unknown as AuthController));
	});

	describe("route mapping", () => {
		it.each([
			{ method: "get", path: "/login", handler: "getLogin", admin: null },
			{ method: "get", path: "/admin/login", handler: "getLogin", admin: true },
			{ method: "get", path: "/register", handler: "getRegister", admin: null },
			{ method: "post", path: "/login", handler: "postLogin", admin: null },
			{
				method: "post",
				path: "/admin/login",
				handler: "postLogin",
				admin: true,
			},
			{ method: "post", path: "/logout", handler: "logout", admin: null },
			{
				method: "post",
				path: "/register",
				handler: "postRegister",
				admin: null,
			},
			{
				method: "get",
				path: "/forgot-password",
				handler: "getForgotPassword",
				admin: null,
			},
			{
				method: "post",
				path: "/forgot-password",
				handler: "postForgotPassword",
				admin: null,
			},
			{
				method: "get",
				path: "/reset-password",
				handler: "getResetPassword",
				admin: null,
			},
			{
				method: "post",
				path: "/reset-password",
				handler: "postResetPassword",
				admin: null,
			},
		] as const)(
			"$method $path calls $handler (admin: $admin)",
			async ({ method, path, handler, admin }) => {
				const response = await request(app)[method](path);

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ handler, admin });
				expect(stub[handler]).toHaveBeenCalledTimes(1);
			},
		);

		it("passes the response object to getRegister", async () => {
			await request(app).get("/register");

			const [res] = stub.getRegister.mock.calls[0] ?? [];
			expect(typeof res?.status).toBe("function");
		});

		it("does not pass an admin flag for the customer login routes", async () => {
			await request(app).get("/login");
			await request(app).post("/login");

			expect(stub.getLogin.mock.calls[0]).toHaveLength(2);
			expect(stub.postLogin.mock.calls[0]).toHaveLength(2);
		});

		it.each([
			["get", "/logout"],
			["put", "/login"],
			["delete", "/register"],
			["get", "/unknown"],
		] as const)("returns 404 for unmapped %s %s", async (method, path) => {
			const response = await request(app)[method](path);

			expect(response.status).toBe(404);
		});
	});

	describe("password reset headers", () => {
		it.each([
			["get", "/forgot-password"],
			["post", "/forgot-password"],
			["get", "/reset-password"],
			["post", "/reset-password"],
		] as const)("%s %s sets no-store and no-referrer", async (method, path) => {
			const response = await request(app)[method](path);

			expect(response.headers["cache-control"]).toBe("no-store");
			expect(response.headers["referrer-policy"]).toBe("no-referrer");
		});

		it("does not set Referrer-Policy on other auth routes", async () => {
			const response = await request(app).get("/login");

			expect(response.headers["referrer-policy"]).toBeUndefined();
		});
	});

	describe("login/logout origin protection", () => {
		it.each([
			["get", "/login"],
			["get", "/admin/login"],
			["post", "/login"],
			["post", "/admin/login"],
			["post", "/logout"],
		] as const)("%s %s sets Cache-Control: no-store", async (method, path) => {
			const response = await request(app)[method](path);

			expect(response.headers["cache-control"]).toBe("no-store");
		});

		it.each(["/login", "/admin/login", "/logout"])(
			"rejects cross-origin POST %s with 403",
			async (path) => {
				const response = await request(app)
					.post(path)
					.set("Host", "shop.example")
					.set("Origin", "https://evil.example");

				expect(response.status).toBe(403);
				expect(stub.postLogin).not.toHaveBeenCalled();
				expect(stub.logout).not.toHaveBeenCalled();
			},
		);

		it.each(["https://shop.example", "http://shop.example"])(
			"allows same-origin POST from %s",
			async (origin) => {
				const response = await request(app)
					.post("/login")
					.set("Host", "shop.example")
					.set("Origin", origin);

				expect(response.status).toBe(200);
				expect(stub.postLogin).toHaveBeenCalledTimes(1);
			},
		);

		it("allows POST without an Origin header", async () => {
			const response = await request(app).post("/logout");

			expect(response.status).toBe(200);
			expect(stub.logout).toHaveBeenCalledTimes(1);
		});

		it("allows cross-origin GET requests", async () => {
			const response = await request(app)
				.get("/login")
				.set("Host", "shop.example")
				.set("Origin", "https://evil.example");

			expect(response.status).toBe(200);
			expect(stub.getLogin).toHaveBeenCalledTimes(1);
		});

		it("does not apply the origin check to registration", async () => {
			const response = await request(app)
				.post("/register")
				.set("Host", "shop.example")
				.set("Origin", "https://evil.example");

			expect(response.status).toBe(200);
			expect(stub.postRegister).toHaveBeenCalledTimes(1);
		});
	});

	describe("rate limiting", () => {
		it("sends standard draft-8 rate limit headers on limited routes", async () => {
			const response = await request(app).post("/login");

			expect(response.headers.ratelimit).toBeDefined();
			expect(response.headers["ratelimit-policy"]).toBeDefined();
			expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
		});

		it("returns 429 after 10 attempts shared across login, admin login and register", async () => {
			const paths = ["/login", "/admin/login", "/register"];
			for (let i = 0; i < 10; i++) {
				const response = await request(app).post(paths[i % 3] ?? "/login");
				expect(response.status).toBe(200);
			}

			const blocked = await request(app).post("/register");

			expect(blocked.status).toBe(429);
			expect(
				stub.postLogin.mock.calls.length + stub.postRegister.mock.calls.length,
			).toBe(10);
		});

		it("does not rate limit logout or GET routes", async () => {
			for (let i = 0; i < 10; i++) {
				await request(app).post("/login");
			}

			expect((await request(app).post("/logout")).status).toBe(200);
			expect((await request(app).get("/login")).status).toBe(200);
			expect((await request(app).post("/forgot-password")).status).toBe(200);
		});

		it("keeps a separate limit per router instance", async () => {
			for (let i = 0; i < 10; i++) {
				await request(app).post("/login");
			}
			const otherApp = express();
			otherApp.use(createAuthRoutes(createStub() as unknown as AuthController));

			expect((await request(app).post("/login")).status).toBe(429);
			expect((await request(otherApp).post("/login")).status).toBe(200);
		});
	});
});
