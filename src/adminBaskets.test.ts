import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

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
		expect(res.text).toContain('href="/admin/baskets" class="admin-back-link"');
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
