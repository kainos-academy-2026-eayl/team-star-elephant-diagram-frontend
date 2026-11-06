import type { Request, Response } from "express";
import nunjucks from "nunjucks";
import { describe, expect, it, vi } from "vitest";
import { BackendApiError } from "./backendApi";
import { AuthController } from "./controllers/authController";
import type { AuthService } from "./services/authService";
import type { SessionService } from "./services/sessionService";
import { menuCategories } from "./siteMenu";

const basket = (...quantities: number[]) => ({
	items: quantities.map((quantity, index) => ({
		productId: index + 1,
		productName: "Item",
		quantity,
		unitPrice: 1,
	})),
	subtotal: 0,
});

const setup = () => {
	const authService = { login: vi.fn() };
	const sessions = {
		request: vi.fn().mockResolvedValue(basket(2, 3)),
		establish: vi.fn(),
	};
	const controller = new AuthController(
		authService as unknown as AuthService,
		sessions as unknown as SessionService,
	);
	const res = {
		status: vi.fn().mockReturnThis(),
		render: vi.fn(),
		redirect: vi.fn(),
	};
	const req = (query: Record<string, string> = {}, body = {}) =>
		({ query, body, get: () => undefined }) as unknown as Request;
	return {
		authService,
		sessions,
		res,
		getLogin: (query?: Record<string, string>, admin = false) =>
			controller.getLogin(req(query), res as unknown as Response, admin),
		postLogin: (body: Record<string, string>, admin = false) =>
			controller.postLogin(req({}, body), res as unknown as Response, admin),
	};
};

describe("AuthController login", () => {
	it("renders the customer login with the basket item count", async () => {
		const { res, getLogin } = setup();

		await getLogin({ registered: "1" });

		expect(res.render).toHaveBeenCalledWith("login", {
			admin: false,
			cartCount: 5,
			registered: true,
			passwordReset: false,
		});
	});

	it("renders the admin login with the basket item count and return path", async () => {
		const { res, getLogin } = setup();

		await getLogin({ reason: "expired", returnTo: "/admin/users" }, true);

		expect(res.render).toHaveBeenCalledWith(
			"login",
			expect.objectContaining({
				admin: true,
				cartCount: 5,
				returnTo: "/admin/users",
				sessionExpired: true,
				forbidden: false,
			}),
		);
	});

	it("renders a zero cart count when the basket lookup fails", async () => {
		const { sessions, res, getLogin } = setup();
		sessions.request.mockRejectedValue(new BackendApiError(401, "Log in"));

		await getLogin();

		expect(res.render).toHaveBeenCalledWith(
			"login",
			expect.objectContaining({ cartCount: 0 }),
		);
	});

	it("keeps the cart count when a login attempt is rejected", async () => {
		const { authService, res, postLogin } = setup();
		authService.login.mockRejectedValue(
			new BackendApiError(401, "Invalid email or password"),
		);

		await postLogin({ email: "ada@example.com", password: "wrong" });

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.render).toHaveBeenCalledWith(
			"login",
			expect.objectContaining({
				error: "Invalid email or password",
				values: { email: "ada@example.com" },
				cartCount: 5,
			}),
		);
	});
});

describe("login template", () => {
	const env = new nunjucks.Environment(
		new nunjucks.FileSystemLoader("src/pages"),
		{ autoescape: true },
	).addGlobal("menuCategories", menuCategories);
	const render = (context: object) => env.render("login.njk", context);

	it.each([
		[false, 'action="/login"'],
		[true, 'action="/admin/login"'],
	])(
		"uses the shared storefront header and burger menu without client-side JS (admin: %s)",
		(admin, action) => {
			const html = render({ admin, cartCount: 0 });

			expect(html).toContain(action);
			expect(html).toContain('class="site-header"');
			expect(html).toContain('command="show-modal"');
			expect(html).toContain('commandfor="site-menu"');
			expect(html).toContain('<dialog class="side-menu" id="site-menu"');
			expect(html).toContain('href="/site.css"');
			expect(html).toContain('href="/login.css"');
			expect(html).not.toContain("<script");
			expect(html).not.toContain("cart-link__badge");
		},
	);

	it.each([false, true])(
		"shows the cart count on the header icon and menu (admin: %s)",
		(admin) => {
			const html = render({ admin, cartCount: 5 });

			expect(html).toMatch(/class="cart-link__badge"[^>]*>5</);
			expect(html).toContain('aria-label="Basket, 5 items"');
			expect(html).toContain('class="menu-item__badge">5<');
		},
	);

	it("labels the customer login and links to the staff login", () => {
		const html = render({});

		expect(html).toContain("<title>Log in | Sedshed</title>");
		expect(html).toContain('<h1 class="login__title">Log in</h1>');
		expect(html).toContain("My account");
		expect(html).toContain('href="/admin/login"');
		expect(html).not.toContain("auth-card--admin");
	});

	it("labels the staff login and links back to the customer login", () => {
		const html = render({ admin: true });

		expect(html).toContain("<title>Staff log in | Sedshed</title>");
		expect(html).toContain('<h1 class="login__title">Admin log in</h1>');
		expect(html).toContain("Staff portal");
		expect(html).toContain("auth-card--admin");
		expect(html).toContain('class="auth-switch" href="/login"');
	});

	it("styles status and error messages", () => {
		const html = render({
			admin: true,
			registered: true,
			sessionExpired: true,
			error: "Invalid input",
			details: { email: ["is required"] },
		});

		expect(html).toContain(
			'<p class="auth-message auth-message--success" role="status">Account created. You can now log in.</p>',
		);
		expect(html).toContain(
			'<p class="auth-message" role="status">Your session has expired. Please log in again.</p>',
		);
		expect(html).toContain(
			'<div class="auth-message auth-message--error" role="alert" id="login-error">',
		);
		expect(html).toContain("<p>email: is required</p>");
	});
});
