import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

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

	it("requires staff credentials before requesting the admin dashboard", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/admin");

		expect(res.status).toBe(401);
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

	it("does not render admin data when the backend rejects staff credentials", async () => {
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
		expect(res.text).toContain("Orders (Unavailable)");
		expect(res.text).not.toContain("Users (Unavailable)");
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
		expect(res.text).toContain('<a href="/admin/users">Users</a>');
		expect(res.text).toContain("Orders (Unavailable)");
		expect(res.text).not.toContain("Baskets (Unavailable)");
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
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: basketSummaries }));
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/baskets")
				.set("Cookie", "session=staff-session");

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
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				"http://backend:4000/admin/baskets",
			);
		});

		it("forwards staff credentials when loading baskets", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(jsonResponse({ baskets: basketSummaries }))
				.mockResolvedValueOnce(jsonResponse({ basket: basketDetails }));
			const client = request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			);
			const expectedHeaders = {
				"Content-Type": "application/json",
				Authorization: ["Bearer", "test-token"].join(" "),
				Cookie: "session=staff-session",
			};

			await client
				.get("/admin/baskets")
				.set("Authorization", ["Bearer", "test-token"].join(" "))
				.set("Cookie", "session=staff-session");
			await client
				.get("/admin/baskets/123")
				.set("Authorization", ["Bearer", "test-token"].join(" "))
				.set("Cookie", "session=staff-session");

			expect(fetchApi.mock.calls[0]?.[1]?.headers).toEqual(expectedHeaders);
			expect(fetchApi.mock.calls[1]?.[1]?.headers).toEqual(expectedHeaders);
		});

		it("filters baskets by search term", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: basketSummaries }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.query({ q: "ADA@example" })
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(200);
			expect(res.text).toContain("Ada Lovelace");
			expect(res.text).not.toContain("John Smith");
			expect(res.text).toContain('value="ADA@example"');
		});

		it("renders an empty state when there are no active baskets", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: [] }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(200);
			expect(res.text).toContain("There are no active baskets.");
			expect(res.text).not.toContain("<table");
		});

		it("renders a no-results state when the search matches nothing", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: basketSummaries }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.query({ q: "<script>" })
				.set("Cookie", "session=staff-session");

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
				.set("Cookie", "session=staff-session");

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
				.set("Cookie", "session=staff-session");

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
					.set("Cookie", "session=staff-session");

				expect(res.status).toBe(404);
				expect(res.text).toContain("Basket not found");
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it("caps the basket search term at 100 characters", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ baskets: basketSummaries }));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets")
				.query({ q: "x".repeat(150) })
				.set("Cookie", "session=staff-session");

			expect(res.text).toContain(`value="${"x".repeat(100)}"`);
			expect(res.text).not.toContain("x".repeat(101));
		});

		it("shows a not found page when the basket does not exist", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ error: "Not found" }, 404));
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/baskets/999")
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(404);
			expect(res.text).toContain("Basket not found");
		});

		it.each(["/admin/baskets", "/admin/baskets/123"])(
			"requires staff credentials before requesting %s",
			async (path) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi })).get(path);

				expect(res.status).toBe(401);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each([
			["/admin/baskets", 401],
			["/admin/baskets", 403],
			["/admin/baskets/123", 401],
			["/admin/baskets/123", 403],
		])(
			"does not render %s when the backend responds %i",
			async (path, status) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValue(jsonResponse({ error: "Denied" }, status));
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "session=customer-session");

				expect(res.status).toBe(status);
				expect(res.text).not.toContain("Active baskets");
				expect(res.text).not.toContain("Basket contents");
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
				.set("Cookie", "session=staff-session");

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
				.set("Cookie", "session=staff-session");
			const searched = await request(app)
				.get("/admin/users?q=nobody")
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(200);
			expect(res.text).toContain("No user accounts found.");
			expect(res.text).not.toContain("<table");
			expect(searched.text).toContain('No users match "nobody".');
		});

		it("renders user details with orders, basket and a suspend action", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse(userDetails()));
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.get("/admin/users/7")
				.set("Cookie", "session=staff-session");

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
				Cookie: "session=staff-session",
			});
		});

		it("offers reactivation for a suspended user with an empty basket", async () => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					...userDetails({ status: "suspended" }),
					recentOrders: [],
					basket: { itemCount: 0, subtotal: 0, items: [] },
				}),
			);
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/7")
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(200);
			expect(res.text).toContain('action="/admin/users/7/reactivate"');
			expect(res.text).toContain("Reactivate account");
			expect(res.text).not.toContain("Suspend account");
			expect(res.text).toContain("No orders yet.");
			expect(res.text).toContain("The basket is empty.");
		});

		it.each(["/admin/users", "/admin/users/7"])(
			"requires staff credentials before requesting %s",
			async (path) => {
				const fetchApi = vi.fn<typeof fetch>();
				const res = await request(createApp({ fetch: fetchApi })).get(path);

				expect(res.status).toBe(401);
				expect(fetchApi).not.toHaveBeenCalled();
			},
		);

		it.each([
			["/admin/users", 401],
			["/admin/users", 403],
			["/admin/users/7", 401],
			["/admin/users/7", 403],
		])(
			"does not render %s when the backend responds %i",
			async (path, status) => {
				const fetchApi = vi
					.fn<typeof fetch>()
					.mockResolvedValue(jsonResponse({ error: "Denied" }, status));
				const res = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "session=customer-session");

				expect(res.status).toBe(status);
				expect(res.text).not.toContain("User accounts");
				expect(res.text).not.toContain("Customer information");
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
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(404);
			expect(res.text).toContain("User not found");
		});

		it("rejects malformed user ids without calling the backend", async () => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.get("/admin/users/bad.id")
				.set("Cookie", "session=staff-session");

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
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(`/admin/users/7?updated=${updated}`);
			expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
				`http://backend:4000/admin/users/7/${action}`,
			);
			expect(fetchApi.mock.calls[0]?.[1]?.method).toBe("POST");
			expect(fetchApi.mock.calls[0]?.[1]?.headers).toMatchObject({
				Cookie: "session=staff-session",
			});
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
					.set("Cookie", "session=staff-session");

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
					.set("Cookie", "session=staff-session");

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
					.set("Cookie", "session=staff-session");

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
				.set("Cookie", "session=staff-session");

			expect(res.text).toContain("The account has been suspended.");
		});

		it("requires staff credentials before changing account status", async () => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi })).post(
				"/admin/users/7/suspend",
			);

			expect(res.status).toBe(401);
			expect(fetchApi).not.toHaveBeenCalled();
		});

		it("propagates rejected credentials when changing account status", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/suspend")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set("Cookie", "session=customer-session");

			expect(res.status).toBe(403);
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
				.set("Cookie", "session=staff-session");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe("/admin/users/7?actionFailed=1");

			const page = await request(app)
				.get(String(res.headers.location))
				.set("Cookie", "session=staff-session");
			expect(page.text).toContain("could not be updated");
			expect(page.text).not.toContain("Connection refused");
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
		[
			"login",
			{ email: "ada@example.com", password: "correct-horse" },
			"/products",
		],
		[
			"forgot-password",
			{ email: "ada@example.com" },
			"/forgot-password?sent=1",
		],
		[
			"reset-password",
			{
				token: "a".repeat(64),
				password: "new-password",
				confirmPassword: "new-password",
			},
			"/login?reset=1",
		],
		[
			"register",
			{
				forename: "Ada",
				surname: "Lovelace",
				email: "ada@example.com",
				password: "correct-horse",
				confirmPassword: "correct-horse",
			},
			"/login?registered=1",
		],
	])(
		"POST /%s forwards JSON to the backend and redirects",
		async (page, values, location) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					page === "login"
						? loginResponse()
						: new Response(JSON.stringify({ status: "ok" })),
				);
			const res = await request(
				createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
			)
				.post(`/${page}`)
				.type("form")
				.send(values);
			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			const [url, options] = fetchApi.mock.calls[0] ?? [];
			expect(String(url)).toBe(`http://backend:4000/${page}`);
			expect(options?.method).toBe("POST");
			const { confirmPassword: _confirmation, ...payload } = values as Record<
				string,
				string
			>;
			expect(JSON.parse(options?.body as string)).toEqual(payload);
		},
	);

	it("does not call the backend when confirmation differs", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/register")
			.type("form")
			.send({
				email: "ada@example.com",
				password: "correct-horse",
				confirmPassword: "different-password",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Passwords do not match.");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it("rate-limits repeated authentication submissions", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid email or password" }), {
				status: 401,
			}),
		);
		const client = request(createApp({ fetch: fetchApi }));

		for (let attempt = 0; attempt < 10; attempt++) {
			const res = await client
				.post("/login")
				.type("form")
				.send({ email: "ada@example.com", password: "wrong-password" });
			expect(res.status).toBe(401);
		}

		const limited = await client
			.post("/login")
			.type("form")
			.send({ email: "ada@example.com", password: "wrong-password" });

		expect(limited.status).toBe(429);
		expect(fetchApi).toHaveBeenCalledTimes(10);
	});

	it("keeps a failed login on the form", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ error: "Invalid email or password" }), {
				status: 401,
			}),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/login")
			.type("form")
			.send({
				email: "ada@example.com",
				password: "wrong-password",
			});
		expect(res.status).toBe(401);
		expect(res.text).toContain("Invalid email or password");
		expect(res.text).toContain('value="ada@example.com"');
		expect(res.headers.location).toBeUndefined();
		expect(res.text).not.toContain("wrong-password");
	});

	it("keeps the token but never passwords after a reset confirmation mismatch", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const token = "a".repeat(64);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/reset-password")
			.type("form")
			.send({
				token,
				password: "private-password",
				confirmPassword: "different",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Passwords do not match.");
		expect(res.text).toContain(`value="${token}"`);
		expect(res.text).not.toContain("private-password");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it.each([
		["/forgot-password", "Invalid email address"],
		["/reset-password", "This reset link is invalid or has expired."],
	])(
		"shows backend rejection for %s without redirecting",
		async (path, error) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					new Response(JSON.stringify({ error }), { status: 400 }),
				);
			const res = await request(createApp({ fetch: fetchApi }))
				.post(path)
				.type("form")
				.send({
					email: "ada@example.com",
					token: "a".repeat(64),
					password: "private-password",
					confirmPassword: "private-password",
				});
			expect(res.status).toBe(400);
			expect(res.text).toContain(error);
			expect(res.text).not.toContain("private-password");
			expect(res.headers.location).toBeUndefined();
		},
	);

	it("loads products from the backend", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response("[]"));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/products");
		expect(res.status).toBe(200);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products",
		);
		expect(res.text).toContain("No products found.");
	});

	it("does not show payment details when opened without basket credentials", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/payment_gateway");

		expect(res.status).toBe(200);
		expect(fetchApi).not.toHaveBeenCalled();
		expect(res.text).not.toContain('id="nameoncard"');
		expect(res.text).not.toContain('id="cardnumber"');
	});

	it("shows a clear unavailable response when the basket service is offline", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/payment_gateway")
			.set("Cookie", "session=test-session");

		expect(res.status).toBe(503);
		expect(res.text).toContain("Basket is temporarily unavailable.");
		expect(res.text).not.toContain("Connection refused");
	});

	it("simulates a payment using product-table prices, not submitted prices", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						prod_id: 7,
						name: "Green tea",
						category: "Food & Drink",
						description: "Fresh tea",
						price: 1299,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "2", price: "0.01" });

		expect(res.status).toBe(200);
		expect(res.text).toContain("Payment successful. Payment was processed.");
		expect(res.text).toContain("£25.98");
		expect(res.text).toContain("Green tea × 2");
		expect(fetchApi).toHaveBeenCalledTimes(1);
	});

	it("simulates multiple selected products and totals their quantities", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						prod_id: 7,
						name: "Green tea",
						category: "Food & Drink",
						description: "Fresh tea",
						price: 1299,
						imageURL: "",
					},
					{
						prod_id: 8,
						name: "Coffee",
						category: "Food & Drink",
						description: "Roasted beans",
						price: 500,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: ["7", "8"], quantity: ["2", "1"] });

		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea × 2");
		expect(res.text).toContain("Coffee × 1");
		expect(res.text).toContain("£30.98");
		expect(res.text).toContain(">3</span>");
	});

	it("rejects payment requests with no selected products", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify([])));
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "0" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("Select at least one product");
	});

	it("rejects product IDs that are not in the products table", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify([])));
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/payment_gateway")
			.type("form")
			.send({ productId: "7", quantity: "1" });

		expect(res.status).toBe(400);
		expect(res.text).toContain("Selected product is no longer available.");
		expect(res.text).toContain("Choose your products");
	});

	it("loads profile details and order history from the backend", async () => {
		const profile = {
			user: {
				firstName: "Ada",
				lastName: "Lovelace",
				email: "ada@example.com",
				memberSince: "2026-01-01",
			},
			orders: [
				{
					id: 42,
					placedAt: "2026-10-01",
					status: "Dispatched",
					items: [
						{
							productName: "Green tea",
							quantity: 2,
							displayUnitPrice: "£3.50",
							displaySubtotal: "£7.00",
						},
					],
					displayTotal: "£7.00",
				},
			],
		};
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(profile)));
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.get("/profile")
			.set("Cookie", "accessToken=customer-access");

		expect(res.status).toBe(200);
		expect(res.text).toContain("Ada Lovelace");
		expect(res.text).toContain("ada@example.com");
		expect(res.text).toContain("Order #42");
		expect(res.text).toContain("Green tea");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/profile",
		);
	});

	it("shows a friendly message when profile data is unavailable", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/profile")
			.set("Cookie", "accessToken=customer-access");

		expect(res.status).toBe(503);
		expect(res.text).toContain("Your profile is temporarily unavailable.");
		expect(res.text).not.toContain("You haven't placed any orders yet.");
		expect(res.text).not.toContain("Connection refused");
	});

	it("renders real products and filters search and category", async () => {
		const products = [
			{
				productId: 7,
				name: "Green tea",
				category: "Food & Drink",
				description: "Fresh tea",
				price: 12.99,
				imageURL: "https://example.com/tea.jpg",
			},
			{
				productId: 2,
				name: "Coffee",
				category: "Other",
				description: "Roasted beans",
				price: 5,
				imageURL: "",
			},
		];
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockImplementation(async () => new Response(JSON.stringify(products)));
		const res = await request(createApp({ fetch: fetchApi }))
			.get("/products")
			.query({ q: "tea", category: "Food & Drink" });
		expect(res.status).toBe(200);
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain('href="/products/7"');
		expect(res.text).not.toContain('href="/products/"');
		expect(res.text).not.toContain("undefined");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).not.toContain("Coffee");
		expect(res.text).toContain("Food%20%26%20Drink");
	});

	it("displays backend prices in pounds without dividing by 100", async () => {
		const products = [
			{
				productId: 1,
				name: "CoreBook 14 Essential",
				category: "Laptops",
				description: "Laptop",
				price: 349.99,
				imageURL: "",
			},
			{
				productId: 2,
				name: "Big monitor",
				category: "Monitors",
				description: "Monitor",
				price: 1249,
				imageURL: "",
			},
		];
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(JSON.stringify(products)));
		const res = await request(createApp({ fetch: fetchApi })).get("/products");

		expect(res.text).toContain("£349.99");
		expect(res.text).toContain("£1,249.00");
		expect(res.text).not.toContain("£3.50");
	});

	it("shows a short description preview on catalogue cards", async () => {
		const description = `${"Long words ".repeat(30)}END-OF-DESCRIPTION`;
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						productId: 3,
						name: "Wordy",
						category: "Other",
						description,
						price: 1,
						imageURL: "",
					},
				]),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get("/products");
		const preview = res.text.match(
			/class="product-card__description"[^>]*>([^<]*)</,
		)?.[1];

		expect(preview).toBeDefined();
		expect(preview?.length).toBeLessThanOrEqual(111);
		expect(preview?.endsWith("…")).toBe(true);
		expect(preview).not.toContain("END-OF-DESCRIPTION");
		expect(res.text).toContain('href="/products/3"');
	});

	it("loads an expanded product by productId", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 42,
					name: "Green tea",
					category: "Food & Drink",
					description: "Fresh tea",
					price: 12.99,
					imageURL: "https://example.com/tea.jpg",
					inventory: { quantity: 30 },
				}),
			),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		).get("/products/42");

		expect(res.status).toBe(200);
		expect(fetchApi).toHaveBeenCalledTimes(1);
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/products/42",
		);
		expect(res.headers["content-type"]).toContain("text/html");
		expect(res.text).toContain("Green tea");
		expect(res.text).toContain("Fresh tea");
		expect(res.text).toContain("Food &amp; Drink");
		expect(res.text).toContain("£12.99");
		expect(res.text).toContain('src="https://example.com/tea.jpg"');
		expect(res.text).toContain('action="/basket" method="post"');
		expect(res.text).toContain('name="productId" value="42"');
		expect(res.text).toMatch(/name="quantity"[^>]*max="30"/);
		expect(res.text).toContain("In stock");
		expect(res.text).not.toMatch(/<button[^>]*disabled/);
		expect(res.text).toContain('href="/styles.css"');
	});

	it.each([
		[{ quantity: 0 }, "Out of stock", true, 'max="1"'],
		[null, "Out of stock", true, 'max="1"'],
		[{ quantity: 3 }, "Only 3 left in stock", false, 'max="3"'],
		[{ quantity: 500 }, "In stock", false, 'max="99"'],
	])(
		"renders stock state for inventory %j",
		async (inventory, message, disabled, max) => {
			const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
				new Response(
					JSON.stringify({
						productId: 5,
						name: "Mouse",
						category: "Mice",
						description: "Clicky",
						price: 19.99,
						imageURL: "",
						inventory,
					}),
				),
			);
			const res = await request(createApp({ fetch: fetchApi })).get(
				"/products/5",
			);

			expect(res.status).toBe(200);
			expect(res.text).toContain(message);
			expect(res.text).toContain(max);
			expect(/<button[^>]*disabled/.test(res.text)).toBe(disabled);
			expect(/name="quantity"[^>]*disabled/.test(res.text)).toBe(disabled);
		},
	);

	it("uses a collapsible full description on the product page", async () => {
		const description = `${"Detail ".repeat(40)}END`;
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 9,
					name: "Laptop",
					category: "Laptops",
					description,
					price: 1,
					imageURL: "",
					inventory: { quantity: 1 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/9",
		);

		expect(res.text).toContain('<details class="product-detail__description">');
		expect(res.text).toContain("Read full description");
		expect(res.text).toContain(description);
	});

	it("does not display a different product than the one requested", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 1,
					name: "Wrong product",
					category: "Other",
					description: "Nope",
					price: 1,
					imageURL: "",
					inventory: { quantity: 1 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/2",
		);

		expect(res.status).toBe(503);
		expect(res.text).not.toContain("Wrong product");
	});

	it("adds a product to the basket and relays the basket cookie", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(JSON.stringify({ items: [], subtotal: 0 }), {
				headers: {
					"Set-Cookie":
						"basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
				},
			}),
		);
		const res = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/basket")
			.set("Cookie", "session=abc")
			.type("form")
			.send({ productId: "42", quantity: "3" });

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/basket");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/basket",
		);
		const init = fetchApi.mock.calls[0]?.[1];
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			productId: 42,
			quantity: 3,
		});
		expect(init?.headers).toMatchObject({ Cookie: "session=abc" });
		expect(res.headers["set-cookie"]).toEqual([
			"basketId=0b7e0c5e-4a8f-4f43-9a2e-3c1f2f6a9d11; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax",
		]);
	});

	it.each([
		[{ productId: "42", quantity: "0" }, "/products/42?basket=invalid"],
		[{ productId: "42", quantity: "100" }, "/products/42?basket=invalid"],
		[{ productId: "42", quantity: "1.5" }, "/products/42?basket=invalid"],
		[{ productId: "abc", quantity: "1" }, "/products"],
	])(
		"rejects invalid add-to-basket input %j without calling the backend",
		async (form, location) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/basket")
				.type("form")
				.send(form);

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(location);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it.each([
		[404, "Product not found", "notfound"],
		[400, "Quantity cannot exceed 99", "limit"],
		[500, "Internal server error", "unavailable"],
	])(
		"returns to the product page when the backend responds %i",
		async (status, error, code) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response(JSON.stringify({ error }), { status }));
			const res = await request(createApp({ fetch: fetchApi }))
				.post("/basket")
				.type("form")
				.send({ productId: "42", quantity: "1" });

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe(`/products/42?basket=${code}`);
		},
	);

	it("shows add-to-basket errors on the product page", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					productId: 42,
					name: "Green tea",
					category: "Food & Drink",
					description: "Fresh tea",
					price: 12.99,
					imageURL: "",
					inventory: { quantity: 30 },
				}),
			),
		);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42?basket=limit",
		);

		expect(res.text).toContain(
			"Your basket already holds the maximum quantity of this product.",
		);
	});

	it.each(["abc", "0", "-1", "1.5", "9007199254740992"])(
		"rejects invalid product ID %s without calling the backend",
		async (productId) => {
			const fetchApi = vi.fn<typeof fetch>();
			const res = await request(createApp({ fetch: fetchApi })).get(
				`/products/${productId}`,
			);

			expect(res.status).toBe(400);
			expect(res.text).toContain("Invalid product ID.");
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it("renders the not-found page for a missing product", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
			);
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42",
		);

		expect(res.status).toBe(404);
		expect(res.text).toContain("Product not found");
	});

	it("shows an unavailable message when the product backend fails", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error("Connection refused"));
		const res = await request(createApp({ fetch: fetchApi })).get(
			"/products/42",
		);

		expect(res.status).toBe(503);
		expect(res.text).toContain("Product is temporarily unavailable");
		expect(res.text).not.toContain("Connection refused");
	});

	it("shows backend field validation without exposing the password", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: "Invalid registration details",
					details: { password: ["Too short"] },
				}),
				{ status: 400 },
			),
		);
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/register")
			.type("form")
			.send({
				forename: "<script>alert(1)</script>",
				email: "ada@example.com",
				password: "secret",
				confirmPassword: "secret",
			});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Too short");
		expect(res.text).not.toContain('value="secret"');
		expect(res.text).not.toContain("<script>");
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
