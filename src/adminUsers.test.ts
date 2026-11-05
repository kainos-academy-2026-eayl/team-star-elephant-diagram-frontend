import { readdirSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { loginResponse } from "./testHelpers";

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
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse(userDetails()));
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
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse({
				...userDetails({ status: "suspended" }),
				recentOrders: [],
				basket: { itemCount: 0, subtotal: 0, items: [] },
			}),
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
				.mockResolvedValueOnce(jsonResponse({ error: "Expired" }, 401))
				.mockResolvedValueOnce(jsonResponse({ error: "Expired refresh" }, 401));
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
			expect(fetchApi).toHaveBeenCalledTimes(2);
		},
	);

	it.each(["/admin/users", "/admin/users/7"])(
		"sends staff without permission for %s to the admin login",
		async (path) => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockResolvedValue(jsonResponse({ error: "Denied" }, 403));
			const res = await request(createApp({ fetch: fetchApi }))
				.get(path)
				.set("Cookie", "accessToken=customer-access");

			expect(res.status).toBe(303);
			expect(res.headers.location).toBe("/admin/login?reason=forbidden");
			expect(res.text).not.toContain("User accounts");
			expect(res.text).not.toContain("Customer information");
		},
	);

	it("refreshes an expired access token and keeps the users list working", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(jsonResponse({ error: "Expired" }, 401))
			.mockResolvedValueOnce(loginResponse())
			.mockResolvedValueOnce(jsonResponse({ users: [adminUser()] }))
			.mockResolvedValueOnce(jsonResponse(userDetails()));
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
		expect(String(fetchApi.mock.calls[1]?.[0])).toBe(
			"http://backend:4000/auth/refresh",
		);
		expect(fetchApi.mock.calls[1]?.[1]?.headers).toMatchObject({
			Cookie: "refreshToken=current-refresh",
		});
		expect(fetchApi.mock.calls[2]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "access-one"].join(" "),
		});
		const cookies = res.headers["set-cookie"] as unknown as string[];
		expect(cookies.some((c) => c.startsWith("accessToken=access-one"))).toBe(
			true,
		);
		expect(cookies.some((c) => c.startsWith("refreshToken=refresh-one"))).toBe(
			true,
		);

		const details = await request(app)
			.get("/admin/users/7")
			.set("Cookie", "accessToken=access-one; refreshToken=refresh-one");
		expect(details.status).toBe(200);
		expect(details.text).toContain("Customer information");
		expect(fetchApi.mock.calls[3]?.[1]?.headers).toMatchObject({
			Authorization: ["Bearer", "access-one"].join(" "),
		});
		expect(fetchApi).toHaveBeenCalledTimes(4);
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
			expect(fetchApi.mock.calls[2]?.[1]?.headers).not.toHaveProperty("Cookie");
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

	it("sends staff without permission to the admin login when changing account status", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
		const res = await request(createApp({ fetch: fetchApi }))
			.post("/admin/users/7/suspend")
			.set("Host", "shop.example")
			.set("Origin", "http://shop.example")
			.set("Cookie", "accessToken=customer-access");

		expect(res.status).toBe(303);
		expect(res.headers.location).toBe("/admin/login?reason=forbidden");
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
