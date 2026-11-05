import { describe, expect, it, vi } from "vitest";
import { BackendApi, BackendApiError } from "../backendApi";

function jsonResponse(
	body: unknown,
	init: ResponseInit & { cookies?: string[] } = {},
): Response {
	const headers = new Headers(init.headers);
	for (const cookie of init.cookies ?? []) {
		headers.append("Set-Cookie", cookie);
	}
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers,
	});
}

function setup(response: Response = jsonResponse({ ok: true })) {
	const fetchApi = vi.fn<typeof fetch>().mockResolvedValue(response);
	const api = new BackendApi("https://backend.example/api/", fetchApi);
	return { api, fetchApi };
}

function lastCall(fetchApi: ReturnType<typeof setup>["fetchApi"]) {
	const call = fetchApi.mock.calls.at(-1);
	if (!call) throw new Error("fetch was not called");
	const [url, init] = call;
	return { url: String(url), init: init ?? {} };
}

describe("BackendApi", () => {
	describe("request building", () => {
		it("resolves relative paths against the base URL", async () => {
			const { api, fetchApi } = setup();

			await api.request("products?page=2");

			expect(lastCall(fetchApi).url).toBe(
				"https://backend.example/api/products?page=2",
			);
		});

		it("resolves absolute paths against the base URL origin", async () => {
			const { api, fetchApi } = setup();

			await api.request("/health");

			expect(lastCall(fetchApi).url).toBe("https://backend.example/health");
		});

		it("passes a URL instance to fetch", async () => {
			const { api, fetchApi } = setup();

			await api.request("products");

			expect(fetchApi.mock.calls[0]?.[0]).toBeInstanceOf(URL);
		});

		it("sends a GET without a body when no body is given", async () => {
			const { api, fetchApi } = setup();

			await api.request("products");

			const { init } = lastCall(fetchApi);
			expect(init.method).toBe("GET");
			expect(init).not.toHaveProperty("body");
			expect(init.headers).toEqual({ "Content-Type": "application/json" });
			expect(init.signal).toBeInstanceOf(AbortSignal);
		});

		it("sends a JSON POST when a body is given", async () => {
			const { api, fetchApi } = setup();

			await api.request("login", { email: "a@example.com", attempts: 1 });

			const { init } = lastCall(fetchApi);
			expect(init.method).toBe("POST");
			expect(init.body).toBe('{"email":"a@example.com","attempts":1}');
		});

		it("merges custom headers and lets them override the defaults", async () => {
			const { api, fetchApi } = setup();

			await api.request("profile", undefined, {
				Authorization: "Bearer token",
				"Content-Type": "text/plain",
			});

			expect(lastCall(fetchApi).init.headers).toEqual({
				Authorization: "Bearer token",
				"Content-Type": "text/plain",
			});
		});

		it.each([
			[undefined, "DELETE"],
			[{ status: "SHIPPED" }, "PATCH"],
		])("uses an explicit method (body: %j)", async (body, method) => {
			const { api, fetchApi } = setup();

			await api.request("orders/1", body, {}, method);

			expect(lastCall(fetchApi).init.method).toBe(method);
		});
	});

	describe("successful responses", () => {
		it("returns the parsed JSON body from request", async () => {
			const { api } = setup(jsonResponse({ products: [{ productId: 1 }] }));

			await expect(api.request("products")).resolves.toEqual({
				products: [{ productId: 1 }],
			});
		});

		it("returns the result and Set-Cookie headers from requestWithResponse", async () => {
			const { api } = setup(
				jsonResponse(
					{ user: "a" },
					{ cookies: ["session=abc; HttpOnly", "csrf=xyz"] },
				),
			);

			await expect(api.requestWithResponse("login", { a: 1 })).resolves.toEqual(
				{
					result: { user: "a" },
					cookies: ["session=abc; HttpOnly", "csrf=xyz"],
				},
			);
		});

		it("returns an empty cookie list when none are set", async () => {
			const { api } = setup();

			const { cookies } = await api.requestWithResponse("products");

			expect(cookies).toEqual([]);
		});
	});

	describe("error responses", () => {
		async function captureError(response: Response): Promise<BackendApiError> {
			const { api } = setup(response);
			const error = await api.request("products").catch((e: unknown) => e);
			expect(error).toBeInstanceOf(BackendApiError);
			return error as BackendApiError;
		}

		it("uses the backend error message, status and string-array details", async () => {
			const error = await captureError(
				jsonResponse(
					{
						error: "Validation failed",
						details: {
							email: ["Required", "Invalid"],
							password: ["Too short"],
						},
					},
					{ status: 400 },
				),
			);

			expect(error).toBeInstanceOf(Error);
			expect(error.status).toBe(400);
			expect(error.message).toBe("Validation failed");
			expect(error.details).toEqual({
				email: ["Required", "Invalid"],
				password: ["Too short"],
			});
		});

		it("drops detail entries that are not arrays of strings", async () => {
			const error = await captureError(
				jsonResponse(
					{
						error: "Bad",
						details: {
							ok: ["fine"],
							notArray: "nope",
							mixed: ["a", 1],
							empty: [],
						},
					},
					{ status: 422 },
				),
			);

			expect(error.details).toEqual({ ok: ["fine"], empty: [] });
		});

		it.each([
			["a non-object details value", { error: "Bad", details: "oops" }],
			["null details", { error: "Bad", details: null }],
			["missing details", { error: "Bad" }],
		])("uses empty details for %s", async (_label, body) => {
			const error = await captureError(jsonResponse(body, { status: 400 }));

			expect(error.details).toEqual({});
		});

		it.each([
			["a non-string error", { error: 42 }],
			["a missing error", {}],
			["a JSON array", ["error"]],
			["a JSON string", "error"],
			["JSON null", null],
		])("falls back to 'Request failed' for %s", async (_label, body) => {
			const error = await captureError(jsonResponse(body, { status: 500 }));

			expect(error.status).toBe(500);
			expect(error.message).toBe("Request failed");
			expect(error.details).toEqual({});
		});

		it("falls back to 'Request failed' when the error body is not JSON", async () => {
			const error = await captureError(
				new Response("<html>Bad gateway</html>", { status: 502 }),
			);

			expect(error.status).toBe(502);
			expect(error.message).toBe("Request failed");
		});

		it("propagates network failures from fetch", async () => {
			const fetchApi = vi
				.fn<typeof fetch>()
				.mockRejectedValue(new TypeError("fetch failed"));
			const api = new BackendApi("https://backend.example/", fetchApi);

			await expect(api.request("products")).rejects.toThrow("fetch failed");
		});

		it("rejects when a successful response is not valid JSON", async () => {
			const { api } = setup(new Response("not json", { status: 200 }));

			await expect(api.request("products")).rejects.toThrow(SyntaxError);
		});
	});

	describe("BackendApiError", () => {
		it("defaults details to an empty object", () => {
			const error = new BackendApiError(404, "Not found");

			expect(error.status).toBe(404);
			expect(error.message).toBe("Not found");
			expect(error.details).toEqual({});
		});
	});
});
