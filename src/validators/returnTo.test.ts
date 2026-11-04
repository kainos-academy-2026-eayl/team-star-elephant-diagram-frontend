import { describe, expect, it } from "vitest";
import { safeAdminReturnTo } from "./returnTo";

describe("safeAdminReturnTo", () => {
	it.each([
		["/admin", "/admin"],
		["/admin/users", "/admin/users"],
		["/admin/users/7", "/admin/users/7"],
		["/admin/users?q=ada&page=2", "/admin/users?q=ada&page=2"],
	])("accepts the admin path %s", (value, expected) => {
		expect(safeAdminReturnTo(value)).toBe(expected);
	});

	it.each([
		undefined,
		42,
		["/admin/users"],
		"",
		"/products",
		"/administrator",
		"https://evil.example/admin",
		"//evil.example/admin",
		"/admin\\..\\evil",
		"/admin/../products",
		"/admin/%2e%2e/products",
		"/admin/login",
		"/admin/login/",
		"/ADMIN/LOGIN",
		"/admin/users\r\nSet-Cookie: x=1",
		"/admin/redirect?to=http://evil.example",
		`/admin/${"a".repeat(200)}`,
	])("rejects %s", (value) => {
		expect(safeAdminReturnTo(value)).toBeUndefined();
	});
});
