import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

const app = createApp();
const loginResponse = () =>
	new Response(JSON.stringify({ accessToken: "access-one", expiresIn: 900 }), {
		headers: {
			"Set-Cookie":
				"refreshToken=refresh-one; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict",
		},
	});

describe("app", () => {
	it("GET /health returns ok", async () => {
		const res = await request(app).get("/health");

		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
	});

	it("GET / renders the homepage with the burger menu", async () => {
		const res = await request(app).get("/");

		expect(res.status).toBe(200);
		expect(res.text).toContain("SEDSHED");
		expect(res.text).toContain('id="site-menu"');
		expect(res.text).toContain('commandfor="site-menu"');
		expect(res.text).not.toContain("<script");
		expect(res.text).toContain("Electronics Shop");
	});

	it("GET / shows no cart badge and skips the backend when logged out", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi })).get("/");

		expect(res.status).toBe(200);
		expect(res.text).not.toContain("cart-link__badge");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("GET / shows the total basket quantity on the cart icon", async () => {
		const basketId = "8e0dcfff-1528-4ec6-9820-b8c9a6732000";
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{ productId: 1, productName: "A", quantity: 2, unitPrice: 1 },
						{ productId: 2, productName: "B", quantity: 3, unitPrice: 1 },
					],
					subtotal: 5,
				}),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/")
			.set("Cookie", `accessToken=access-one; basketId=${basketId}`);

		expect(res.status).toBe(200);
		expect(res.text).toMatch(/class="cart-link__badge"[^>]*>5</);
		expect(res.text).toContain('aria-label="Basket, 5 items"');
		expect(res.text).toContain('class="menu-item__badge">5<');
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: `basketId=${basketId}`,
		});
	});

	it.each([
		[1, "1", "Basket, 1 item"],
		[120, "99+", "Basket, 120 items"],
	])(
		"GET / formats a basket of %i items as %s",
		async (quantity, text, label) => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(
					JSON.stringify({
						items: [{ productId: 1, productName: "A", quantity, unitPrice: 1 }],
						subtotal: quantity,
					}),
				),
			);
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/")
				.set("Cookie", "accessToken=access-one");

			expect(res.text).toMatch(
				new RegExp(
					`class="cart-link__badge"[^>]*>${text.replace("+", "\\+")}<`,
				),
			);
			expect(res.text).toContain(`aria-label="${label}"`);
		},
	);

	it("GET / still renders without a badge when the basket is unavailable", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response("{}", { status: 503 }));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/")
			.set("Cookie", "accessToken=access-one");

		expect(res.status).toBe(200);
		expect(res.text).toContain("SEDSHED");
		expect(res.text).not.toContain("cart-link__badge");
	});

	it.each(["/home.css", "/images/home/slide.png"])(
		"serves the homepage asset %s",
		async (path) => {
			const res = await request(app).get(path);

			expect(res.status).toBe(200);
		},
	);

	it.each([
		["/login", "Log in"],
		["/register", "Create your account"],
		["/forgot-password", "Forgot your password?"],
	])("GET %s renders the page", async (path, heading) => {
		expect(readdirSync("src/pages")).toContain(`${path.slice(1)}.njk`);

		const res = await request(app).get(path);

		expect(res.status).toBe(200);
		expect(res.text).toContain(heading);
	});

	it("loads admin dashboard data from the backend", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [{ label: "Orders" }],
			quickActions: [{ label: "Add product" }],
			cards: [{ label: "Orders today", value: "4" }],
			recentOrders: [
				{ id: 42, customer: "Ada Lovelace", date: "2026-10-27", status: "New" },
			],
			newUsers: [],
			stockChanges: [],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(dashboard)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/admin")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(200);
		expect(res.text).toContain("Orders today");
		expect(res.text).toContain(">4</p>");
		expect(res.text).toContain("Ada Lovelace");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/admin",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "test-token"].join(" "),
		});
	});

	it("redirects to the admin login before requesting the admin dashboard without a session", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/admin");

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/admin/login");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("forwards the browser access cookie as an admin Authorization header", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [],
			quickActions: [],
			cards: [],
			recentOrders: [],
			newUsers: [],
			stockChanges: [],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(dashboard)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/admin")
			.set("Cookie", "accessToken=staff-access");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Staff member");
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
			Authorization: "Bearer staff-access",
		});
	});

	it("shows access denied when staff lack dashboard permission", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/admin")
			.set("Cookie", "accessToken=customer-access");

		expect(res.status).toBe(403);
		expect(res.headers.location).toBeUndefined();
		expect(res.text).toContain("Access denied");
		expect(res.text).not.toContain("New registrations");
	});

	it("links to user management from the admin navigation", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [{ label: "Users" }, { label: "Orders" }],
			quickActions: [],
			cards: [],
			recentOrders: [],
			newUsers: [],
			stockChanges: [],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(dashboard)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/admin")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(200);
		expect(res.text).toContain('<a href="/admin/users">Users</a>');
		expect(res.text).not.toContain('href="/admin/orders"');
		expect(res.text).not.toContain("Unavailable");
	});

	it("shows the baskets link in the admin navigation", async () => {
		const dashboard = {
			staff: { name: "Staff member" },
			sections: [{ label: "Baskets" }, { label: "Orders" }],
			quickActions: [],
			cards: [],
			recentOrders: [],
			newUsers: [],
			stockChanges: [],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(dashboard)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/admin")
			.set("Cookie", "accessToken=staff-access");

		expect(res.text).toContain('<a href="/admin" class="active"');
		expect(res.text).toContain('<a href="/admin/baskets">Baskets</a>');
		expect(res.text).not.toContain('href="/admin/orders"');
		expect(res.text).not.toContain('<a href="/admin/users">Users</a>');
		expect(res.text).not.toContain("Unavailable");
	});

	it.each(["/admin/orders", "/admin/orders/1"])(
		"returns 404 for the unimplemented order page %s without requesting backend data",
		async (path) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.get(path)
				.set("Cookie", "accessToken=staff-access");
			expect(res.status).toBe(404);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it("does not expose order mutations before order pages are implemented", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/admin/orders/1/status")
			.send({ status: "SHIPPED" });
		expect(res.status).toBe(404);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	describe("admin baskets", () => {
		const basketSummaries = [
			{
				basketId: 123,
				customerName: "John Smith",
				customerEmail: "john@example.com",
				itemCount: 4,
				total: "£85.00",
				lastActivity: "2026-10-25",
				status: "Active",
			},
			{
				basketId: 456,
				customerName: "Ada Lovelace",
				customerEmail: "ada@example.com",
				itemCount: 1,
				total: "£12.99",
				lastActivity: "2026-10-26",
				status: "Active",
			},
		];
		const basketDetails = {
			basketId: 123,
			createdAt: "2026-10-20",
			lastActivity: "2026-10-25",
			status: "Active",
			customer: { name: "John Smith", email: "john@example.com" },
			items: [
				{
					productName: "Green tea",
					quantity: 2,
					unitPrice: "£3.50",
					totalPrice: "£7.00",
				},
				{
					productName: "Coffee beans",
					quantity: 2,
					unitPrice: "£39.00",
					totalPrice: "£78.00",
				},
			],
			itemCount: 4,
			total: "£85.00",
		};
		const jsonResponse = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), { status });
		it("renders the active basket list from the backend", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockImplementation(async () =>
				jsonResponse({
					baskets: basketSummaries,
					sections: [{ label: "Baskets" }],
				}),
			);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/baskets")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("Active baskets");
			expect(res.text).toContain("#123");
			expect(res.text).toContain("John Smith");
			expect(res.text).toContain("john@example.com");
			expect(res.text).toContain('<td class="admin-numeric">4</td>');
			expect(res.text).toContain("£85.00");
			expect(res.text).toContain("2026-10-25");
			expect(res.text).toContain("Active</span>");
			expect(res.text).toContain('href="/admin/baskets/123"');
			expect(res.text).toContain("Ada Lovelace");
			expect(res.text).toContain(
				'<a href="/admin/baskets" class="active" aria-current="page">Baskets</a>',
			);
			expect(res.headers["cache-control"]).toBe("no-store");
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/baskets",
			);
		});

		it("forwards only the staff access token when loading baskets", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockImplementation(async () =>
				jsonResponse({
					baskets: basketSummaries,
					basket: basketDetails,
					sections: [{ label: "Baskets" }],
				}),
			);
			const client = request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			);
			const expectedHeaders = {
				"Content-Type": "application/json",
				Authorization: ["Bearer", "staff-access"].join(" "),
			};

			await client
				.get("/admin/baskets")
				.set("Cookie", "accessToken=staff-access; session=unrelated");
			await client
				.get("/admin/baskets/123")
				.set("Cookie", "accessToken=staff-access; session=unrelated");

			expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual(expectedHeaders);
			expect(fetchApi.mock.calls[1]?.[1]?.headers).toEqual(expectedHeaders);
		});

		it("sends the basket search term to the backend", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: [basketSummaries[1]] }));
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/baskets")
				.query({ q: "  lovelace ada  " })
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("Ada Lovelace");
			expect(res.text).not.toContain("John Smith");
			expect(res.text).toContain('value="lovelace ada"');
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/baskets?search=lovelace+ada",
			);
		});

		it("renders an empty state when there are no active baskets", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: [] }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("There are no active baskets.");
			expect(res.text).not.toContain("<table");
		});

		it("renders a no-results state when the search matches nothing", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: [] }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.query({ q: "<script>" })
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("No baskets match");
			expect(res.text).toContain("&lt;script&gt;");
			expect(res.text).not.toContain("<script>");
		});

		it("renders basket details from the backend", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ basket: basketDetails }));
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/baskets/123")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("Basket #123");
			expect(res.text).toContain("2026-10-20");
			expect(res.text).toContain("2026-10-25");
			expect(res.text).toContain("John Smith");
			expect(res.text).toContain("john@example.com");
			expect(res.text).toContain("Green tea");
			expect(res.text).toContain("£3.50");
			expect(res.text).toContain("£7.00");
			expect(res.text).toContain("Coffee beans");
			expect(res.text).toContain("<dd>4</dd>");
			expect(res.text).toContain("<dd>£85.00</dd>");
			expect(res.text).toContain(
				'href="/admin/baskets" class="admin-back-link"',
			);
			expect(res.headers["cache-control"]).toBe("no-store");
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/baskets/123",
			);
		});

		it("renders an empty basket", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					basket: { ...basketDetails, items: [], itemCount: 0, total: "£0.00" },
				}),
			);
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets/123")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("This basket is empty.");
			expect(res.text).not.toContain("<table");
			expect(res.text).toContain("<dd>0</dd>");
			expect(res.text).toContain("<dd>£0.00</dd>");
		});

		it.each(["..%2Fusers", "123%3Fx%3D1", "a".repeat(65)])(
			"rejects malformed basket id %s without calling the backend",
			async (id) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.get(`/admin/baskets/${id}`)
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(404);
				expect(res.text).toContain("Basket not found");
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it("caps the basket search term at 100 characters", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: [] }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.query({ q: "x".repeat(150) })
				.set("Cookie", "accessToken=staff-access");

			expect(res.text).toContain(`value="${"x".repeat(100)}"`);
			expect(res.text).not.toContain("x".repeat(101));
			expect(String(fetchApi.mock.calls[0]?.[0])).toContain(
				`search=${"x".repeat(100)}`,
			);
			expect(String(fetchApi.mock.calls[0]?.[0])).not.toContain(
				"x".repeat(101),
			);
		});

		it("shows a not found page when the basket does not exist", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ error: "Not found" }, 404));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets/999")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(404);
			expect(res.text).toContain("Basket not found");
		});

		it.each([
			["/admin/baskets", "/admin/login?returnTo=%2Fadmin%2Fbaskets"],
			["/admin/baskets/123", "/admin/login?returnTo=%2Fadmin%2Fbaskets%2F123"],
			[
				"/admin/baskets?q=ada",
				"/admin/login?returnTo=%2Fadmin%2Fbaskets%3Fq%3Dada",
			],
		])(
			"redirects to the admin login without a session for %s",
			async (path, location) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi })).get(path);

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(location);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each(["/admin/baskets", "/admin/baskets/123"])(
			"ignores unrelated browser cookies and redirects to the admin login for %s",
			async (path) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "session=staff-session");

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(
					`/admin/login?returnTo=${encodeURIComponent(path)}`,
				);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each(["/admin/baskets", "/admin/baskets/123"])(
			"redirects to the admin login when the session has expired for %s",
			async (path) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockImplementation(() =>
						Promise.resolve(jsonResponse({ error: "Expired" }, 401)),
					);
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set(
						"Cookie",
						"accessToken=expired-access; refreshToken=expired-refresh",
					);

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(
					`/admin/login?reason=expired&returnTo=${encodeURIComponent(path)}`,
				);
				expect(res.text).not.toContain("Unauthorized");
				expect(res.headers["set-cookie"]).toHaveLength(2);
				expect(fetchApi).toHaveBeenCalledTimes(3);
			},
		);

		it.each(["/admin/baskets", "/admin/baskets/123"])(
			"shows access denied for staff without permission to %s",
			async (path) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockImplementation(() =>
						Promise.resolve(jsonResponse({ error: "Denied" }, 403)),
					);
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(403);
				expect(res.headers.location).toBeUndefined();
				expect(res.text).toContain("Access denied");
				expect(res.text).not.toContain("Active baskets");
				expect(res.text).not.toContain("Basket contents");
			},
		);

		it("refreshes an expired access token and keeps the baskets pages working", async () => {
			const fetchApi = vi.fn<typeof fetch>((input, init) => {
				const url = String(input);
				const headers = init?.headers as Record<string, string> | undefined;
				if (headers?.Authorization === ["Bearer", "expired-access"].join(" ")) {
					return Promise.resolve(jsonResponse({ error: "Expired" }, 401));
				}
				if (url.endsWith("/auth/refresh")) {
					return Promise.resolve(loginResponse());
				}
				if (url.endsWith("/admin/baskets/123")) {
					return Promise.resolve(jsonResponse({ basket: basketDetails }));
				}
				if (url.endsWith("/admin/baskets")) {
					return Promise.resolve(jsonResponse({ baskets: basketSummaries }));
				}
				if (url.endsWith("/admin")) {
					return Promise.resolve(
						jsonResponse({
							staff: { name: "Staff member" },
							sections: [{ label: "Baskets" }],
							quickActions: [],
						}),
					);
				}
				return Promise.resolve(jsonResponse({ error: "Unexpected URL" }, 500));
			});
			const app = createApp({
				apiBaseUrl: "http://backend:4000",
				fetch: fetchApi,
			});
			const res = await request(app)
				.get("/admin/baskets")
				.set(
					"Cookie",
					"accessToken=expired-access; refreshToken=current-refresh",
				);

			expect(res.status).toBe(200);
			expect(res.text).toContain("John Smith");
			expect(
				fetchApi.mock.calls.some(([url]) =>
					String(url).endsWith("/auth/refresh"),
				),
			).toBe(true);
			expect(
				fetchApi.mock.calls.filter(
					([, options]) =>
						(options?.headers as Record<string, string>)?.Authorization ===
						["Bearer", "access-one"].join(" "),
				),
			).toHaveLength(2);
			const cookies = res.headers["set-cookie"] as unknown as string[];
			expect(cookies.some((c) => c.startsWith("accessToken=access-one"))).toBe(
				true,
			);
			expect(
				cookies.some((c) => c.startsWith("refreshToken=refresh-one")),
			).toBe(true);

			const details = await request(app)
				.get("/admin/baskets/123")
				.set("Cookie", "accessToken=access-one; refreshToken=refresh-one");
			expect(details.status).toBe(200);
			expect(details.text).toContain("Basket #123");
			expect(fetchApi.mock.calls).toHaveLength(7);
		});

		it.each(["/admin/baskets", "/admin/baskets/123"])(
			"sends a logged-in customer from %s back to the shop without logging them out",
			async (path) => {
				const customerToken = [
					"e30",
					Buffer.from(
						JSON.stringify({ kind: "customer", tokenUse: "access" }),
					).toString("base64url"),
					"signature",
				].join(".");
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set(
						"Cookie",
						`accessToken=${customerToken}; refreshToken=customer-refresh`,
					);

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe("/products");
				expect(res.headers["set-cookie"]).toBeUndefined();
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each([
			["/admin/baskets", "Baskets are temporarily unavailable"],
			["/admin/baskets/123", "Basket details are temporarily unavailable"],
		])("handles an unavailable backend for %s", async (path, message) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockRejectedValue(new Error("Connection refused"));
			const res = await request(createApp({ fetch: fetchApi }))
				.get(path)
				.set("Authorization", ["Bearer", "test-token"].join(" "));

			expect(res.status).toBe(503);
			expect(res.text).toContain(message);
			expect(res.text).toContain('role="alert"');
			expect(res.text).not.toContain("Connection refused");
		});
	});

	describe("admin user management", () => {
		const adminUser = (overrides = {}) => ({
			id: 7,
			name: "Ada Lovelace",
			email: "ada@example.com",
			registeredAt: "2026-10-01T09:30:00.000Z",
			status: "active",
			...overrides,
		});
		const userDetails = (overrides = {}) => ({
			staff: { name: "Staff member" },
			role: "Admin",
			sections: [{ label: "Users" }],
			quickActions: [{ label: "Suspend or reactivate customers" }],
			user: adminUser(overrides),
			recentOrders: [
				{
					id: 42,
					placedAt: "2026-10-20T12:00:00.000Z",
					status: "Dispatched",
					total: 24.5,
				},
			],
			basket: {
				itemCount: 3,
				subtotal: 12,
				items: [{ productName: "Notebook", quantity: 3 }],
			},
		});
		const jsonResponse = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), { status });
		const userAccess = {
			staff: { name: "Staff member" },
			role: "Admin",
			sections: [{ label: "Users" }],
			quickActions: [{ label: "Suspend or reactivate customers" }],
		};

		it.each(["admin-users", "admin-user-details"])(
			"provides the %s template",
			(page) => {
				expect(readdirSync("src/pages")).toContain(`${page}.njk`);
			},
		);

		it("renders the users page and forwards bearer credentials", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					users: [
						adminUser(),
						adminUser({
							id: 8,
							name: "Grace Hopper",
							email: "grace@example.com",
							status: "suspended",
						}),
					],
				}),
			);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/users")
				.set("Authorization", ["Bearer", "test-token"].join(" "));

			expect(res.status).toBe(200);
			expect(res.text).toContain("User accounts");
			expect(res.text).toContain("Ada Lovelace");
			expect(res.text).toContain("ada@example.com");
			expect(res.text).toContain("1 Oct 2026");
			expect(res.text).toContain("Active");
			expect(res.text).toContain("Suspended");
			expect(res.text).toContain('href="/admin/users/7"');
			expect(res.text).toContain("View details");
			expect(res.text).toContain('name="q"');
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/users",
			);
			expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "test-token"].join(" "),
			});
		});

		it("forwards search and page to the backend and renders pagination", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					users: [adminUser()],
					pagination: { page: 2, pageSize: 20, totalPages: 3, totalUsers: 41 },
				}),
			);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/users?q=ada%20l&page=2")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain('value="ada l"');
			expect(res.text).toContain("Page 2 of 3");
			expect(res.text).toContain('href="/admin/users?q=ada+l&amp;page=1"');
			expect(res.text).toContain('href="/admin/users?q=ada+l&amp;page=3"');
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/users?search=ada+l&page=2",
			);
		});

		it("renders an empty state when there are no users", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockImplementation(async () => jsonResponse({ users: [] }));
			const app = createApp({ fetch: fetchApi });

			const res = await request(app)
				.get("/admin/users")
				.set("Cookie", "accessToken=staff-access");
			const searched = await request(app)
				.get("/admin/users?q=nobody")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("No user accounts found.");
			expect(res.text).not.toContain("<table");
			expect(searched.text).toContain('No users match "nobody".');
		});

		it("renders user details with orders, basket and a suspend action", async () => {
			const fetchApi = vi.fn<typeof fetch>((input) =>
				Promise.resolve(
					jsonResponse(
						String(input).endsWith("/admin") ? userAccess : userDetails(),
					),
				),
			);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/users/7")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain("Customer information");
			expect(res.text).toContain("Ada Lovelace");
			expect(res.text).toContain("ada@example.com");
			expect(res.text).toContain("1 Oct 2026");
			expect(res.text).toContain("Recent orders");
			expect(res.text).toContain("#42");
			expect(res.text).toContain("£24.50");
			expect(res.text).toContain("Current basket");
			expect(res.text).toContain("Notebook");
			expect(res.text).toContain("£12.00");
			expect(res.text).toContain('action="/admin/users/7/suspend"');
			expect(res.text).toContain("Suspend account");
			expect(res.text).not.toContain("Reactivate account");
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/users/7",
			);
			expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "staff-access"].join(" "),
			});
			expect(fetchApi.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Cookie");
		});

		it("offers reactivation for a suspended user with an empty basket", async () => {
			const fetchApi = vi.fn<typeof fetch>((input) =>
				Promise.resolve(
					jsonResponse(
						String(input).endsWith("/admin")
							? userAccess
							: {
									...userDetails({ status: "suspended" }),
									recentOrders: [],
									basket: { itemCount: 0, subtotal: 0, items: [] },
								},
					),
				),
			);
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/7")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(200);
			expect(res.text).toContain('action="/admin/users/7/reactivate"');
			expect(res.text).toContain("Reactivate account");
			expect(res.text).not.toContain("Suspend account");
			expect(res.text).toContain("No orders yet.");
			expect(res.text).toContain("The basket is empty.");
		});

		it.each(["active", "suspended"])(
			"does not offer status changes for a read-only role with an %s user",
			async (status) => {
				const fetchApi = vi.fn<typeof fetch>((input) =>
					Promise.resolve(
						jsonResponse(
							String(input).endsWith("/admin")
								? {
										staff: { name: "Staff member" },
										role: "Read-only staff",
										sections: [{ label: "Users" }],
										quickActions: [],
									}
								: userDetails({ status }),
						),
					),
				);
				const res = await request(createApp({ fetch: fetchApi }))
					.get("/admin/users/7")
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(200);
				expect(res.text).not.toContain("Suspend account");
				expect(res.text).not.toContain("Reactivate account");
			},
		);

		it.each([
			["/admin/users", "/admin/login?returnTo=%2Fadmin%2Fusers"],
			["/admin/users/7", "/admin/login?returnTo=%2Fadmin%2Fusers%2F7"],
			[
				"/admin/users?q=ada&page=2",
				"/admin/login?returnTo=%2Fadmin%2Fusers%3Fq%3Dada%26page%3D2",
			],
		])(
			"redirects to the admin login without a session for %s",
			async (path, location) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi })).get(path);

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(location);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each(["/admin/users", "/admin/users/7"])(
			"ignores unrelated browser cookies and redirects to the admin login for %s",
			async (path) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "session=staff-session");

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(
					`/admin/login?returnTo=${encodeURIComponent(path)}`,
				);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each(["/admin/users", "/admin/users/7"])(
			"redirects to the admin login when the session has expired for %s",
			async (path) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockImplementation(() =>
						Promise.resolve(jsonResponse({ error: "Expired" }, 401)),
					);
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set(
						"Cookie",
						"accessToken=expired-access; refreshToken=expired-refresh",
					);

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(
					`/admin/login?reason=expired&returnTo=${encodeURIComponent(path)}`,
				);
				expect(res.text).not.toContain("Unauthorized");
				expect(res.headers["set-cookie"]).toHaveLength(2);
				expect(fetchApi).toHaveBeenCalledTimes(3);
			},
		);

		it.each(["/admin/users", "/admin/users/7"])(
			"shows access denied for staff without permission to %s",
			async (path) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockImplementation(() =>
						Promise.resolve(jsonResponse({ error: "Denied" }, 403)),
					);
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "accessToken=customer-access");

				expect(res.status).toBe(403);
				expect(res.headers.location).toBeUndefined();
				expect(res.text).toContain("Access denied");
				expect(res.text).not.toContain("User accounts");
				expect(res.text).not.toContain("Customer information");
			},
		);

		it("refreshes an expired access token and keeps the users list working", async () => {
			const fetchApi = vi.fn<typeof fetch>((input, init) => {
				const url = String(input);
				const headers = init?.headers as Record<string, string> | undefined;
				if (headers?.Authorization === ["Bearer", "expired-access"].join(" ")) {
					return Promise.resolve(jsonResponse({ error: "Expired" }, 401));
				}
				if (url.endsWith("/auth/refresh")) {
					return Promise.resolve(loginResponse());
				}
				if (url.endsWith("/admin/users/7")) {
					return Promise.resolve(jsonResponse(userDetails()));
				}
				if (url.endsWith("/admin/users")) {
					return Promise.resolve(jsonResponse({ users: [adminUser()] }));
				}
				if (url.endsWith("/admin")) {
					return Promise.resolve(
						jsonResponse({
							staff: { name: "Staff member" },
							role: "Admin",
							sections: [{ label: "Users" }],
							quickActions: [{ label: "Suspend or reactivate customers" }],
						}),
					);
				}
				return Promise.resolve(jsonResponse({ error: "Unexpected URL" }, 500));
			});
			const app = createApp({
				apiBaseUrl: "http://backend:4000",
				fetch: fetchApi,
			});
			const res = await request(app)
				.get("/admin/users")
				.set(
					"Cookie",
					"accessToken=expired-access; refreshToken=current-refresh",
				);

			expect(res.status).toBe(200);
			expect(res.text).toContain("Ada Lovelace");
			expect(
				fetchApi.mock.calls.some(([url]) =>
					String(url).endsWith("/auth/refresh"),
				),
			).toBe(true);
			expect(
				fetchApi.mock.calls.filter(
					([, options]) =>
						(options?.headers as Record<string, string>)?.Authorization ===
						["Bearer", "access-one"].join(" "),
				),
			).toHaveLength(2);
			const cookies = res.headers["set-cookie"] as unknown as string[];
			expect(cookies.some((c) => c.startsWith("accessToken=access-one"))).toBe(
				true,
			);
			expect(
				cookies.some((c) => c.startsWith("refreshToken=refresh-one")),
			).toBe(true);

			const details = await request(app)
				.get("/admin/users/7")
				.set("Cookie", "accessToken=access-one; refreshToken=refresh-one");
			expect(details.status).toBe(200);
			expect(details.text).toContain("Customer information");
			expect(fetchApi.mock.calls).toHaveLength(7);
		});

		it.each(["suspend", "reactivate"])(
			"refreshes an expired access token before retrying %s",
			async (action) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValueOnce(jsonResponse({ error: "Expired" }, 401))
					.mockResolvedValueOnce(loginResponse())
					.mockResolvedValueOnce(jsonResponse({ user: { id: 7 } }));
				const res = await request(
					createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
				)
					.post(`/admin/users/7/${action}`)
					.set("Host", "shop.example")
					.set("Origin", "http://shop.example")
					.set(
						"Cookie",
						"accessToken=expired-access; refreshToken=current-refresh",
					);

				expect(res.status).toBe(303);
				expect(res.headers.location).toMatch(/^\/admin\/users\/7\?updated=/);
				expect(String(fetchApi.mock.calls[2]?.[0])).toBe(
					`http://backend:4000/admin/users/7/${action}`,
				);
				expect(fetchApi.mock.calls[2]?.[1]?.method).toBe("POST");
				expect(fetchApi.mock.calls[2]?.[1]?.headers).toMatchObject({
					Authorization: ["Bearer", "access-one"].join(" "),
				});
				expect(fetchApi.mock.calls[2]?.[1]?.headers).not.toHaveProperty(
					"Cookie",
				);
				expect(res.headers["set-cookie"]).toHaveLength(2);
			},
		);

		it.each(["/admin/users", "/admin/users/7"])(
			"handles an unavailable backend for %s",
			async (path) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockRejectedValue(new Error("Connection refused"));
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Authorization", ["Bearer", "test-token"].join(" "));

				expect(res.status).toBe(503);
				expect(res.text).toContain("temporarily unavailable");
				expect(res.text).toContain("Retry");
				expect(res.text).not.toContain("Connection refused");
			},
		);

		it("shows not found for an unknown user", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ error: "Not found" }, 404));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/999")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(404);
			expect(res.text).toContain("User not found");
		});

		it("rejects malformed user ids without calling the backend", async () => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/bad.id")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(404);
			expect(fetchApi).not.toHaveBeenCalled();
		});

		it.each([
			["suspend", "suspended"],
			["reactivate", "reactivated"],
		])("posts %s requests with staff credentials", async (action, updated) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					jsonResponse({ user: { id: 7, status: "suspended" } }),
				);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.post(`/admin/users/7/${action}`)
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(`/admin/users/7?updated=${updated}`);
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				`http://backend:4000/admin/users/7/${action}`,
			);
			expect(fetchApi.mock.calls[0]?.[1]?.method).toBe("POST");
			expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "staff-access"].join(" "),
			});
			expect(fetchApi.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Cookie");
		});

		it.each([
			["suspend", "suspended"],
			["reactivate", "reactivated"],
		])(
			"accepts HTTPS-proxied %s requests from the configured proxy",
			async (action, updated) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValue(
						jsonResponse({ user: { id: 7, status: "suspended" } }),
					);
				const res = await request(
					createApp({ fetch: fetchApi, trustedProxy: "loopback" }),
				)
					.post(`/admin/users/7/${action}`)
					.set("Host", "shop.example")
					.set("Origin", "https://shop.example")
					.set("X-Forwarded-Proto", "https")
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe(`/admin/users/7?updated=${updated}`);
				expect(fetchApi).toHaveBeenCalledOnce();
			},
		);

		it.each(["suspend", "reactivate"])(
			"rejects cross-origin %s requests before calling the backend",
			async (action) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.post(`/admin/users/7/${action}`)
					.set("Host", "shop.example")
					.set("Origin", "https://attacker.example")
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(403);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each(["suspend", "reactivate"])(
			"rejects %s requests without an Origin before calling the backend",
			async (action) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi }))
					.post(`/admin/users/7/${action}`)
					.set("Cookie", "accessToken=staff-access");

				expect(res.status).toBe(403);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it("confirms a status change on the details page", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse(userDetails({ status: "suspended" })));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/7?updated=suspended")
				.set("Cookie", "accessToken=staff-access");

			expect(res.text).toContain("The account has been suspended.");
		});

		it("redirects to the admin login before changing account status without a session", async () => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/suspend")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(
				"/admin/login?returnTo=%2Fadmin%2Fusers%2F7",
			);
			expect(fetchApi).not.toHaveBeenCalled();
		});

		it("shows access denied when staff lack permission to change account status", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockImplementation(() =>
					Promise.resolve(jsonResponse({ error: "Forbidden" }, 403)),
				);
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/suspend")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set("Cookie", "accessToken=customer-access");

			expect(res.status).toBe(403);
			expect(res.headers.location).toBeUndefined();
			expect(res.text).toContain("Access denied");
		});

		it("reuses refreshed credentials when checking access after a forbidden status change", async () => {
			const fetchApi = vi.fn<typeof fetch>((input, init) => {
				const url = String(input);
				const authorization = (
					init?.headers as Record<string, string> | undefined
				)?.Authorization;
				if (url.endsWith("/auth/refresh")) {
					return Promise.resolve(loginResponse());
				}
				if (url.endsWith("/admin/users/7/suspend")) {
					return Promise.resolve(
						authorization === ["Bearer", "expired-access"].join(" ")
							? jsonResponse({ error: "Expired" }, 401)
							: jsonResponse({ error: "Forbidden" }, 403),
					);
				}
				if (url.endsWith("/admin")) {
					return Promise.resolve(
						jsonResponse({
							staff: { name: "Staff member" },
							role: "Read-only staff",
							sections: [{ label: "Users" }],
							quickActions: [],
						}),
					);
				}
				return Promise.resolve(jsonResponse({ error: "Unexpected URL" }, 500));
			});
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/suspend")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set(
					"Cookie",
					"accessToken=expired-access; refreshToken=current-refresh",
				);

			expect(res.status).toBe(403);
			expect(res.headers.location).toBeUndefined();
			expect(res.text).toContain("Access denied");
			expect(
				fetchApi.mock.calls.filter(([url]) =>
					String(url).endsWith("/auth/refresh"),
				),
			).toHaveLength(1);
			expect(fetchApi.mock.calls[3]?.[1]?.headers).toMatchObject({
				Authorization: ["Bearer", "access-one"].join(" "),
			});
			expect(String(res.headers["set-cookie"])).toContain(
				"accessToken=access-one",
			);
			expect(String(res.headers["set-cookie"])).toContain(
				"refreshToken=refresh-one",
			);
		});

		it("reports a failed status change when the backend is unavailable", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockRejectedValueOnce(new Error("Connection refused"))
				.mockResolvedValueOnce(jsonResponse(userDetails()));
			const app = createApp({ fetch: fetchApi });
			const res = await request(app)
				.post("/admin/users/7/suspend")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set("Cookie", "accessToken=staff-access");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe("/admin/users/7?actionFailed=1");

			const page = await request(app)
				.get(String(res.headers.location))
				.set("Cookie", "accessToken=staff-access");
			expect(page.text).toContain("could not be updated");
			expect(page.text).not.toContain("Connection refused");
		});

		describe("customer sessions on admin pages", () => {
			const customerToken = [
				"e30",
				Buffer.from(
					JSON.stringify({ kind: "customer", tokenUse: "access" }),
				).toString("base64url"),
				"signature",
			].join(".");

			it.each(["/admin", "/admin/users", "/admin/users/7"])(
				"sends a logged-in customer from %s back to the shop without logging them out",
				async (path) => {
					const fetchApi = vi.fn<typeof fetch>();
					const res = await request(createApp({ fetch: fetchApi }))
						.get(path)
						.set(
							"Cookie",
							`accessToken=${customerToken}; refreshToken=customer-refresh`,
						);

					expect(res.status).toBe(303);
					expect(res.headers.location).toBe("/products");
					expect(res.headers["set-cookie"]).toBeUndefined();
					expect(fetchApi).not.toHaveBeenCalled();
				},
			);

			it("returns a refresh-only customer to the shop with renewed credentials", async () => {
				const refreshedCustomerToken = [
					"e30",
					Buffer.from(
						JSON.stringify({ kind: "customer", tokenUse: "access" }),
					).toString("base64url"),
					"signature",
				].join(".");
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValueOnce(
						new Response(
							JSON.stringify({
								accessToken: refreshedCustomerToken,
								expiresIn: 900,
							}),
							{
								headers: {
									"Set-Cookie":
										"refreshToken=new-customer-refresh; Path=/; HttpOnly; Secure; SameSite=Strict",
								},
							},
						),
					)
					.mockResolvedValueOnce(jsonResponse({ error: "Forbidden" }, 403));
				const res = await request(createApp({ fetch: fetchApi }))
					.get("/admin")
					.set("Cookie", "refreshToken=customer-refresh");

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe("/products");
				expect(res.headers["set-cookie"]).toHaveLength(2);
				expect(res.headers["set-cookie"]).toEqual(
					expect.arrayContaining([
						expect.stringContaining(`accessToken=${refreshedCustomerToken}`),
						expect.stringContaining("refreshToken=new-customer-refresh"),
					]),
				);
				expect(fetchApi).toHaveBeenCalledTimes(2);
			});

			it.each(["suspend", "reactivate"])(
				"does not let a customer %s accounts or reach the staff login",
				async (action) => {
					const fetchApi = vi.fn<typeof fetch>();
					const res = await request(createApp({ fetch: fetchApi }))
						.post(`/admin/users/7/${action}`)
						.set("Host", "shop.example")
						.set("Origin", "http://shop.example")
						.set("Cookie", `accessToken=${customerToken}`);

					expect(res.status).toBe(303);
					expect(res.headers.location).toBe("/products");
					expect(fetchApi).not.toHaveBeenCalled();
				},
			);
		});

		describe("admin login return path", () => {
			it("keeps the requested admin page through the login form", async () => {
				const form = await request(createApp()).get(
					"/admin/login?reason=expired&returnTo=%2Fadmin%2Fusers%3Fq%3Dada%26page%3D2",
				);

				expect(form.text).toContain(
					"Your session has expired. Please log in again.",
				);
				expect(form.text).toContain(
					'<input type="hidden" name="returnTo" value="/admin/users?q=ada&amp;page=2">',
				);
			});

			it("explains forbidden access on the admin login", async () => {
				const form = await request(createApp()).get(
					"/admin/login?reason=forbidden",
				);

				expect(form.text).toContain(
					"You need a staff account to access that page.",
				);
				expect(form.text).not.toContain("Your session has expired.");
			});

			it("shows no reason message for an unknown reason", async () => {
				const form = await request(createApp()).get(
					"/admin/login?reason=%3Cscript%3E",
				);

				expect(form.text).not.toContain("Your session has expired.");
				expect(form.text).not.toContain("You need a staff account");
				expect(form.text).not.toContain("<script>");
			});

			it("drops unsafe return paths from the admin login form", async () => {
				const form = await request(createApp()).get(
					"/admin/login?returnTo=https%3A%2F%2Fevil.example",
				);

				expect(form.text).not.toContain('name="returnTo"');
			});

			it("returns the admin to the requested page after logging in", async () => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValueOnce(loginResponse());
				const res = await request(createApp({ fetch: fetchApi }))
					.post("/admin/login")
					.type("form")
					.send({
						email: "admin@example.com",
						password: "correct-horse",
						returnTo: "/admin/users?q=ada&page=2",
					});

				expect(res.status).toBe(303);
				expect(res.headers.location).toBe("/admin/users?q=ada&page=2");
				expect(JSON.parse(String(fetchApi.mock.calls[0]?.[1]?.body))).toEqual({
					email: "admin@example.com",
					password: "correct-horse",
				});
			});

			it.each([
				"https://evil.example",
				"//evil.example",
				"/admin/login",
				"/products",
			])(
				"ignores the unsafe return path %s after logging in",
				async (returnTo) => {
					const fetchApi = vi
						.fn<typeof fetch>()
						.mockResolvedValueOnce(loginResponse());
					const res = await request(createApp({ fetch: fetchApi }))
						.post("/admin/login")
						.type("form")
						.send({
							email: "admin@example.com",
							password: "correct-horse",
							returnTo,
						});

					expect(res.status).toBe(303);
					expect(res.headers.location).toBe("/admin");
				},
			);

			it("keeps the return path when an admin login fails", async () => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValueOnce(
						jsonResponse({ error: "Invalid email or password" }, 401),
					);
				const res = await request(createApp({ fetch: fetchApi }))
					.post("/admin/login")
					.type("form")
					.send({
						email: "admin@example.com",
						password: "wrong",
						returnTo: "/admin/users/7",
					});

				expect(res.status).toBe(401);
				expect(res.text).toContain(
					'<input type="hidden" name="returnTo" value="/admin/users/7">',
				);
			});

			it("leaves the customer login unchanged", async () => {
				const form = await request(createApp()).get(
					"/login?reason=expired&returnTo=%2Fadmin%2Fusers",
				);
				expect(form.text).not.toContain('name="returnTo"');
				expect(form.text).not.toContain("Your session has expired.");

				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValueOnce(loginResponse());
				const res = await request(createApp({ fetch: fetchApi }))
					.post("/login")
					.type("form")
					.send({
						email: "ada@example.com",
						password: "correct-horse",
						returnTo: "/admin/users",
					});
				expect(res.headers.location).toBe("/products");
			});
		});
	});

	it("loads basket data and forwards browser credentials to the backend", async () => {
		const basket = {
			items: [
				{
					productId: 1,
					productName: "Green tea",
					quantity: 2,
					unitPrice: 3.5,
					imageURL: "https://example.com/tea.jpg",
				},
			],
			subtotal: 7,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(basket)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "))
			.set("Cookie", "session=customer-session");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("£3.50 each");
		expect(res.text).toContain("£7.00");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "test-token"].join(" "),
		});
	});

	it("requires authentication before loading a basket", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/basket");

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to view your basket.");
		expect(res.text).toContain('href="/login"');
		expect(res.text).toMatch(/id="basket-empty"[^>]*hidden/);
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("establishes a browser session at login and uses it to load the basket", async () => {
		const basket = {
			items: [
				{
					productId: 1,
					productName: "Green tea",
					quantity: 1,
					unitPrice: 3.5,
				},
			],
			subtotal: 3.5,
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(loginResponse())
			.mockResolvedValueOnce(new Response(JSON.stringify(basket)));
		const client = request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		);

		const login = await client
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "correct-horse" });
		const basketResponse = await client
			.get("/basket")
			.set("Cookie", "accessToken=access-one; refreshToken=refresh-one");

		expect(login.status).toBe(303);
		expect(login.headers["set-cookie"]).toHaveLength(2);
		for (const cookie of login.headers["set-cookie"] ?? []) {
			expect(cookie).toContain("HttpOnly");
			expect(cookie).toContain("Secure");
			expect(cookie).toContain("SameSite=Strict");
		}
		expect(basketResponse.status).toBe(200);
		expect(basketResponse.text).toContain("Green tea");
		expect(fetchApi.mock.calls[1]?.[1]?.headers).toMatchObject({
			Authorization: "Bearer access-one",
		});
	});

	it("forwards only the basket cookie when loading an authenticated customer's basket", async () => {
		const basketId = "8e0dcfff-1528-4ec6-9820-b8c9a6732000";
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ items: [], subtotal: 0 })),
			);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/basket")
			.set(
				"Cookie",
				`accessToken=access-one; refreshToken=refresh-one; basketId=${basketId}`,
			);

		expect(res.status).toBe(200);
		expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual({
			"Content-Type": "application/json",
			Authorization: ["Bearer", "access-one"].join(" "),
			Cookie: `basketId=${basketId}`,
		});
	});

	it("handles rejected basket credentials as unauthenticated", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/basket")
			.set("Authorization", ["Bearer", "test-token"].join(" "));

		expect(res.status).toBe(401);
		expect(res.text).toContain("Please log in to view your basket.");
		expect(res.text).not.toContain("temporarily unavailable");
	});

	it("shows registration confirmation on the login page", async () => {
		const res = await request(app).get("/login?registered=1");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Account created. You can now log in.");
	});

	it("places the forgotten-password prompt below the sign-up prompt", async () => {
		const res = await request(app).get("/login");
		expect(res.text).toContain('href="/forgot-password"');
		expect(res.text.indexOf("Forgot your password?")).toBeGreaterThan(
			res.text.indexOf("Don't have an account?"),
		);
	});

	it("renders reset forms without caching or leaking referrers", async () => {
		const token = "a".repeat(64);
		const res = await request(app).get(`/reset-password?token=${token}`);
		expect(readdirSync("src/pages")).toContain("reset-password.njk");
		expect(res.status).toBe(200);
		expect(res.headers["cache-control"]).toBe("no-store");
		expect(res.headers["referrer-policy"]).toBe("no-referrer");
		expect(res.text).toContain(`name="token" value="${token}"`);
		expect(res.text).toContain('autocomplete="new-password"');
	});

	it.each(["", "?token=invalid", "?token=x&token=y"])(
		"rejects a missing or malformed reset token %s",
		async (query) => {
			const res = await request(app).get(`/reset-password${query}`);
			expect(res.status).toBe(400);
			expect(res.text).toContain("This reset link is invalid.");
			expect(res.text).not.toContain("<form");
			expect(res.text).toContain('href="/forgot-password"');
		},
	);

	it("shows generic reset-request confirmation and password-reset success", async () => {
		const sent = await request(app).get("/forgot-password?sent=1");
		expect(sent.text).toContain("If an account exists for that email");
		expect(sent.text).not.toContain("<form");
		const reset = await request(app).get("/login?reset=1");
		expect(reset.text).toContain(
			"Password reset. You can now log in with your new password.",
		);
	});

	it("does not serve the removed legacy catalogue path", async () => {
		const res = await request(app).get("/product_catalogue");

		expect(res.status).toBe(404);
	});

	it("serves the stylesheet", async () => {
		const res = await request(app).get("/styles.css");

		expect(res.status).toBe(200);
		expect(res.headers["content-type"]).toContain("text/css");
	});

	it.each([
		"/login",
		"/register",
		"/forgot-password",
		"/reset-password",
		"/products",
		"/admin",
		"/basket",
	])("handles an unavailable backend for %s", async (path) => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const client = request(createApp({ fetch: fetchApi }));
		const res = ["/products", "/admin", "/basket"].includes(path)
			? await (path === "/admin" || path === "/basket"
					? client
							.get(path)
							.set("Authorization", ["Bearer", "test-token"].join(" "))
					: client.get(path))
			: await client.post(path).type("form").send({
					password: "correct-horse",
					confirmPassword: "correct-horse",
				});
		expect(res.status).toBe(503);
		expect(res.text).toContain("temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
	});
});
