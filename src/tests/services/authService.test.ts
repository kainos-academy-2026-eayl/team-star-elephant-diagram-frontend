import { describe, expect, it, vi } from "vitest";
import { BackendApi, BackendApiError } from "../../backendApi";
import { AuthService } from "../../services/authService";
import { loginResponse } from "../testHelpers";

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });

const setup = () => {
	const fetchMock = vi.fn<typeof fetch>();
	const service = new AuthService(
		new BackendApi("http://backend:4000", fetchMock),
	);
	return { fetchMock, service };
};

const sentRequest = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) => {
	const [url, init] = fetchMock.mock.calls[0] ?? [];
	return {
		url: String(url),
		method: init?.method,
		headers: init?.headers,
		body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
	};
};

describe("AuthService", () => {
	it("posts registration details to the backend", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json({ id: 1 }, 201));
		const details = { email: "ada@example.com", password: "correct-horse" };

		await expect(service.register(details)).resolves.toBeUndefined();

		expect(sentRequest(fetchMock)).toEqual({
			url: "http://backend:4000/register",
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: details,
		});
	});

	it("logs in a customer and returns the tokens with the backend cookies", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(loginResponse());
		const details = { email: "ada@example.com", password: "correct-horse" };

		const result = await service.login(details);

		expect(result.result).toEqual({
			accessToken: "access-one",
			expiresIn: 900,
		});
		expect(result.cookies).toHaveLength(1);
		expect(result.cookies[0]).toMatch(/^refreshToken=refresh-one;/);
		expect(sentRequest(fetchMock)).toMatchObject({
			url: "http://backend:4000/login",
			method: "POST",
			body: details,
		});
	});

	it("uses the admin login endpoint for staff logins", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(loginResponse());

		await service.login({ email: "staff@example.com", password: "pw" }, true);

		expect(sentRequest(fetchMock).url).toBe("http://backend:4000/admin/login");
	});

	it.each([
		["forgotPassword", "/forgot-password", { email: "ada@example.com" }],
		[
			"resetPassword",
			"/reset-password",
			{ token: "reset-token", password: "new-password" },
		],
	] as const)("%s posts to %s", async (method, path, details) => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(json({ ok: true }));

		await expect(service[method]({ ...details })).resolves.toBeUndefined();

		expect(sentRequest(fetchMock)).toMatchObject({
			url: `http://backend:4000${path}`,
			method: "POST",
			body: details,
		});
	});

	it("surfaces backend validation errors with their details", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json(
				{
					error: "Validation failed",
					details: { email: ["Email is already registered"] },
				},
				400,
			),
		);

		const error = await service
			.register({ email: "ada@example.com" })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(BackendApiError);
		expect(error).toMatchObject({
			status: 400,
			message: "Validation failed",
			details: { email: ["Email is already registered"] },
		});
	});

	it("rejects failed logins with the backend status", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(
			json({ error: "Invalid credentials" }, 401),
		);

		await expect(
			service.login({ email: "ada@example.com", password: "wrong" }),
		).rejects.toMatchObject({ status: 401, message: "Invalid credentials" });
	});

	it("uses a generic message when the error body is not JSON", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockResolvedValueOnce(new Response("oops", { status: 500 }));

		await expect(
			service.forgotPassword({ email: "ada@example.com" }),
		).rejects.toMatchObject({ status: 500, message: "Request failed" });
	});

	it("propagates network failures", async () => {
		const { fetchMock, service } = setup();
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

		await expect(
			service.resetPassword({ token: "t", password: "p" }),
		).rejects.toThrow("fetch failed");
	});
});
