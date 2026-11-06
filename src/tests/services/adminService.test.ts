import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { BackendApiError } from "../../backendApi";
import { AdminService } from "../../services/adminService";
import type { SessionService } from "../../services/sessionService";

const req = {} as Request;
const res = {} as Response;

const setup = () => {
	const request = vi.fn();
	const accessTokenKind = vi.fn();
	const sessions = { request, accessTokenKind } as unknown as SessionService;
	const service = new AdminService(sessions);
	return { request, accessTokenKind, service };
};

const user = {
	id: 7,
	name: "Ada Lovelace",
	email: "ada@example.com",
	registeredAt: "2026-01-15T10:00:00Z",
	status: "active",
};

describe("AdminService", () => {
	describe("session-backed requests", () => {
		it("loads the dashboard through the session", async () => {
			const { request, service } = setup();
			const dashboard = { staff: { name: "Ada" } };
			request.mockResolvedValueOnce(dashboard);

			await expect(service.getDashboard(req, res)).resolves.toMatchObject(
				dashboard,
			);
			expect(request).toHaveBeenCalledExactlyOnceWith("/admin", req, res);
		});

		it.each([
			["customer", true],
			["staff", false],
			[undefined, false],
		])("isCustomerSession is %s -> %s", (kind, expected) => {
			const { accessTokenKind, service } = setup();
			accessTokenKind.mockReturnValueOnce(kind);

			expect(service.isCustomerSession(req)).toBe(expected);
			expect(accessTokenKind).toHaveBeenCalledWith(req);
		});
	});

	describe("input helpers", () => {
		it("loads access through the session without forwarding browser cookies", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({ sections: [{ label: "Users" }] });

			const access = await service.getAccess(req, res);

			expect(request).toHaveBeenCalledExactlyOnceWith("/admin", req, res);
			expect(access.nav).toContainEqual({
				key: "users",
				label: "Users",
				href: "/admin/users",
			});
		});

		it("restricts access when no permissions are known", () => {
			const { service } = setup();

			expect(service.getRestrictedAccess()).toMatchObject({
				nav: [{ key: "dashboard", label: "Dashboard", href: "/admin" }],
				canChangeUserStatus: false,
				canDeleteUsers: false,
				canViewInventory: false,
				inventoryPermissions: {
					view: false,
					create: false,
					update: false,
					delete: false,
				},
			});
		});

		it("trims and limits search terms", () => {
			const { service } = setup();

			expect(service.normaliseSearch("  ada  ")).toBe("ada");
			expect(service.normaliseSearch("x".repeat(150))).toHaveLength(100);
			expect(service.normaliseSearch(["ada"])).toBe("");
			expect(service.normaliseSearch(undefined)).toBe("");
		});

		it.each([
			["3", 3],
			[undefined, 1],
			["0", 1],
			["-2", 1],
			["1.5", 1],
			["abc", 1],
			[4, 1],
		])("normalisePage(%j) is %d", (value, expected) => {
			expect(setup().service.normalisePage(value)).toBe(expected);
		});

		it("validates ids", () => {
			const { service } = setup();

			expect(service.isValidId("abc_123-XYZ")).toBe(true);
			expect(service.isValidId("")).toBe(false);
			expect(service.isValidId("../etc")).toBe(false);
			expect(service.isValidId("a".repeat(65))).toBe(false);
		});

		it("builds encoded detail links", () => {
			const { service } = setup();

			expect(service.getUserDetailsHref("a/b")).toBe("/admin/users/a%2Fb");
		});

		it.each([
			["http://localhost:3000", "localhost:3000", "http", true],
			["https://localhost:3000", "localhost:3000", "https", true],
			["https://localhost:3000", "localhost:3000", "http", false],
			["https://evil.example", "localhost:3000", "https", false],
			["not a url", "localhost:3000", "http", false],
			[undefined, "localhost:3000", "http", false],
			["http://localhost:3000", undefined, "http", false],
		])("isSameOrigin(%s, %s, %s) is %s", (origin, host, protocol, expected) => {
			expect(setup().service.isSameOrigin(origin, host, protocol)).toBe(
				expected,
			);
		});

		it("defaults to http when no protocol is given", () => {
			expect(
				setup().service.isSameOrigin("http://localhost:3000", "localhost:3000"),
			).toBe(true);
		});

		it("parses status updates", () => {
			const { service } = setup();

			expect(service.parseStatusUpdate("suspended")).toBe("suspended");
			expect(service.parseStatusUpdate("reactivated")).toBe("reactivated");
			expect(service.parseStatusUpdate("deleted")).toBeUndefined();
		});
	});

	describe("users", () => {
		it("requests users with search and page and maps them for display", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({
				users: [user, { ...user, id: "a b", status: "SUSPENDED" }],
				pagination: { page: 2, pageSize: 10, totalPages: 3, totalUsers: 25 },
			});

			const view = await service.getUsers(req, res, {
				search: "ada lovelace",
				page: 2,
			});

			expect(request).toHaveBeenCalledExactlyOnceWith(
				"/admin/users?search=ada+lovelace&page=2",
				req,
				res,
			);
			expect(view.users).toEqual([
				{
					...user,
					detailsHref: "/admin/users/7",
					displayRegisteredAt: "15 Jan 2026",
					statusLabel: "Active",
					isSuspended: false,
				},
				expect.objectContaining({
					detailsHref: "/admin/users/a%20b",
					statusLabel: "Suspended",
					isSuspended: true,
				}),
			]);
			expect(view.pagination).toEqual({
				page: 2,
				pageSize: 10,
				totalPages: 3,
				totalUsers: 25,
				previousHref: "/admin/users?q=ada+lovelace&page=1",
				nextHref: "/admin/users?q=ada+lovelace&page=3",
			});
		});

		it("omits default query parameters and single-page pagination", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({
				users: [{ ...user, registeredAt: "not a date" }],
				pagination: { page: 1, pageSize: 10, totalPages: 1, totalUsers: 1 },
			});

			const view = await service.getUsers(req, res, { page: 1 });

			expect(request).toHaveBeenCalledWith("/admin/users", req, res);
			expect(view.users[0]?.displayRegisteredAt).toBe("not a date");
			expect(view).not.toHaveProperty("pagination");
		});

		it("omits links beyond the first and last page", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({
				users: [],
				pagination: { page: 1, pageSize: 10, totalPages: 2, totalUsers: 12 },
			});

			const view = await service.getUsers(req, res);

			expect(view.pagination?.previousHref).toBeUndefined();
			expect(view.pagination?.nextHref).toBe("/admin/users?page=2");
		});

		it("tolerates a missing users list", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({});

			await expect(service.getUsers(req, res)).resolves.toEqual({ users: [] });
		});

		it("loads and formats a user's details", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({
				user,
				recentOrders: [
					{
						id: 1,
						placedAt: "2026-02-03T00:00:00Z",
						status: "NEW",
						total: 9.5,
					},
				],
				basket: {
					itemCount: 1,
					subtotal: 4.25,
					items: [{ productName: "Mug", quantity: 1 }],
				},
			});

			const view = await service.getUserById(req, res, "7");

			expect(request).toHaveBeenCalledWith("/admin/users/7", req, res);
			expect(view.user.detailsHref).toBe("/admin/users/7");
			expect(view.recentOrders).toEqual([
				{
					id: 1,
					placedAt: "2026-02-03T00:00:00Z",
					status: "NEW",
					total: 9.5,
					displayPlacedAt: "3 Feb 2026",
					displayTotal: "£9.50",
				},
			]);
			expect(view.basket).toEqual({
				itemCount: 1,
				items: [{ productName: "Mug", quantity: 1 }],
				displaySubtotal: "£4.25",
			});
		});

		it("defaults missing orders and basket details", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({ user });

			const view = await service.getUserById(req, res, "7");

			expect(view.recentOrders).toEqual([]);
			expect(view.basket).toEqual({
				itemCount: 0,
				items: [],
				displaySubtotal: "£0.00",
			});
		});

		it.each([
			["suspend", "suspended"],
			["reactivate", "reactivated"],
		] as const)(
			"%s posts to the user action endpoint",
			async (action, expected) => {
				const { request, service } = setup();
				request.mockResolvedValueOnce({ user: { id: 7, status: "x" } });

				await expect(
					service.changeUserStatus(req, res, "7", action),
				).resolves.toBe(expected);
				expect(request).toHaveBeenCalledExactlyOnceWith(
					`/admin/users/7/${action}`,
					req,
					res,
					{},
					{},
				);
			},
		);

		it("propagates session errors", async () => {
			const { request, service } = setup();
			request.mockRejectedValueOnce(new BackendApiError(403, "Forbidden"));

			await expect(
				service.changeUserStatus(req, res, "7", "suspend"),
			).rejects.toMatchObject({ status: 403 });
		});
	});

	describe("baskets", () => {
		const baskets = [
			{
				basketId: 1,
				customerName: "Ada Lovelace",
				customerEmail: "ada@example.com",
				itemCount: 2,
				total: "£10.00",
				lastActivity: "2026-01-01",
				status: "active",
			},
			{
				basketId: "b/2",
				customerName: "Charles Babbage",
				customerEmail: "charles@example.com",
				itemCount: 1,
				total: "£5.00",
				lastActivity: "2026-01-02",
				status: "active",
			},
		];

		it("lists baskets with credentials and detail links", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({ baskets });

			const result = await service.getBaskets(req, res);

			expect(request).toHaveBeenCalledExactlyOnceWith(
				"/admin/baskets",
				req,
				res,
			);
			expect(result.map((basket) => basket.detailsHref)).toEqual([
				"/admin/baskets/1",
				"/admin/baskets/b%2F2",
			]);
		});

		it.each([
			["CHARLES", ["b/2"]],
			["ada@example", [1]],
			["1", [1]],
			["nobody", []],
		])("passes basket search %j to the backend", async (search, ids) => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({
				baskets: baskets.filter((basket) =>
					ids.some((id) => id === basket.basketId),
				),
			});

			const result = await service.getBaskets(req, res, search);

			expect(request).toHaveBeenCalledExactlyOnceWith(
				`/admin/baskets?search=${encodeURIComponent(search)}`,
				req,
				res,
			);
			expect(result.map((basket) => basket.basketId)).toEqual(ids);
		});

		it("tolerates a missing baskets list", async () => {
			const { request, service } = setup();
			request.mockResolvedValueOnce({});

			await expect(service.getBaskets(req, res)).resolves.toEqual([]);
		});

		it("loads a basket by encoded id", async () => {
			const { request, service } = setup();
			const basket = { basketId: "b/2", items: [] };
			request.mockResolvedValueOnce({ basket });

			await expect(service.getBasketById(req, res, "b/2")).resolves.toEqual({
				basket,
				products: [],
			});
			expect(request).toHaveBeenCalledExactlyOnceWith(
				"/admin/baskets/b%2F2",
				req,
				res,
			);
		});

		it("rejects with the backend error for unknown baskets", async () => {
			const { request, service } = setup();
			request.mockRejectedValueOnce(
				new BackendApiError(404, "Basket not found"),
			);

			await expect(
				service.getBasketById(req, res, "999"),
			).rejects.toMatchObject({ status: 404, message: "Basket not found" });
		});

		it("propagates network failures", async () => {
			const { request, service } = setup();
			request.mockRejectedValueOnce(new TypeError("fetch failed"));

			await expect(service.getBaskets(req, res)).rejects.toThrow(
				"fetch failed",
			);
		});
	});
});
