import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const user = {
	id: 7,
	name: "Ada Lovelace",
	email: "ada@example.com",
	registeredAt: "2026-10-01T09:30:00.000Z",
	status: "active",
};
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const dashboard = (canDelete = true) => ({
	staff: { name: "Staff member" },
	role: canDelete ? "Admin" : "CustomerService",
	sections: [{ label: "Users" }],
	quickActions: canDelete
		? [
				{ label: "Suspend or reactivate customers" },
				{ label: "Permanently delete customers" },
			]
		: [],
});

describe("permanent customer deletion", () => {
	it.each(["/admin/users", "/admin/users/7"])(
		"shows confirmed deletion and suspension on %s only to authorised staff",
		async (path) => {
			for (const canDelete of [true, false]) {
				const fetchApi = vi.fn<typeof fetch>(async (input) =>
					json(
						String(input).endsWith("/admin")
							? dashboard(canDelete)
							: {
									users: [user],
									user,
									recentOrders: [],
									basket: { items: [], itemCount: 0, subtotal: 0 },
								},
					),
				);
				const response = await request(createApp({ fetch: fetchApi }))
					.get(path)
					.set("Cookie", "accessToken=staff-access");
				expect(response.status).toBe(200);
				expect(response.text.includes('action="/admin/users/7/delete"')).toBe(
					canDelete,
				);
				expect(response.text.includes('action="/admin/users/7/suspend"')).toBe(
					canDelete,
				);
				if (canDelete) {
					expect(response.text).toContain(
						'name="confirmDelete" value="yes" required',
					);
					expect(response.text).toContain("This cannot be undone.");
				}
			}
		},
	);

	it("posts deletion with staff credentials and returns to the list", async () => {
		const fetchApi = vi
			.fn<typeof fetch>()
			.mockResolvedValue(json({ deleted: true }));
		const response = await request(
			createApp({ apiBaseUrl: "http://backend:4000", fetch: fetchApi }),
		)
			.post("/admin/users/7/delete")
			.set("Host", "shop.example")
			.set("Origin", "http://shop.example")
			.set("Cookie", "accessToken=staff-access")
			.type("form")
			.send({ confirmDelete: "yes" });
		expect(response.status).toBe(303);
		expect(response.headers.location).toBe("/admin/users?deleted=1");
		expect(String(fetchApi.mock.calls[0]?.[0])).toBe(
			"http://backend:4000/admin/users/7/delete",
		);
		expect(fetchApi.mock.calls[0]?.[1]).toMatchObject({
			method: "POST",
			headers: { Authorization: ["Bearer", "staff-access"].join(" ") },
		});
	});

	it("requires explicit confirmation", async () => {
		const fetchApi = vi.fn<typeof fetch>();
		const response = await request(createApp({ fetch: fetchApi }))
			.post("/admin/users/7/delete")
			.set("Host", "shop.example")
			.set("Origin", "http://shop.example")
			.set("Cookie", "accessToken=staff-access");
		expect(response.status).toBe(400);
		expect(response.text).toContain("Confirm permanent deletion");
		expect(fetchApi).not.toHaveBeenCalled();
	});

	it.each(["https://attacker.example", ""])(
		"rejects an unsafe or absent origin: %s",
		async (origin) => {
			const fetchApi = vi.fn<typeof fetch>();
			const response = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/delete")
				.set("Host", "shop.example")
				.set("Origin", origin)
				.type("form")
				.send({ confirmDelete: "yes" });
			expect(response.status).toBe(403);
			expect(fetchApi).not.toHaveBeenCalled();
		},
	);

	it.each([
		[401, 303, "/admin/login?returnTo=%2Fadmin%2Fusers%2F7", ""],
		[403, 403, undefined, "Access denied"],
		[404, 404, undefined, "User not found"],
		[500, 503, undefined, "The customer could not be deleted"],
	])(
		"handles backend HTTP %s without claiming success",
		async (status, expected, location, message) => {
			const fetchApi = vi.fn<typeof fetch>(async (input) =>
				String(input).endsWith("/admin")
					? json(dashboard(false))
					: json({ error: "Request failed" }, status),
			);
			const response = await request(createApp({ fetch: fetchApi }))
				.post("/admin/users/7/delete")
				.set("Host", "shop.example")
				.set("Origin", "http://shop.example")
				.set("Cookie", "accessToken=staff-access")
				.type("form")
				.send({ confirmDelete: "yes" });
			expect(response.status).toBe(expected);
			expect(response.headers.location).toBe(location);
			if (message) expect(response.text).toContain(message);
			expect(response.text).not.toContain("have been permanently deleted");
		},
	);

	it("shows a deletion confirmation after returning to the list", async () => {
		const fetchApi = vi.fn<typeof fetch>(async (input) =>
			json(String(input).endsWith("/admin") ? dashboard() : { users: [] }),
		);
		const response = await request(createApp({ fetch: fetchApi }))
			.get("/admin/users?deleted=1")
			.set("Cookie", "accessToken=staff-access");
		expect(response.text).toContain("have been permanently deleted");
	});

	it("removes staff-management controls even from older backend dashboards", async () => {
		const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(
			json({
				...dashboard(),
				role: "SuperAdmin",
				sections: [{ label: "Admin accounts" }, { label: "Permissions" }],
				quickActions: [
					{ label: "Manage admin accounts" },
					{ label: "Manage permissions" },
				],
				cards: [],
				recentOrders: [],
				newUsers: [],
				stockChanges: [],
			}),
		);
		const response = await request(createApp({ fetch: fetchApi }))
			.get("/admin")
			.set("Cookie", "accessToken=staff-access");
		expect(response.status).toBe(200);
		for (const label of [
			"Admin accounts",
			"Permissions",
			"Manage admin accounts",
			"Manage permissions",
		]) {
			expect(response.text).not.toContain(label);
		}
	});
});
