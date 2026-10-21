export interface Product {
	prod_id: number;
	name: string;
	category: string;
	description: string;
	price: number;
	imageURL: string;
}

export class BackendApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly details: Record<string, string[]> = {},
	) {
		super(message);
	}
}

export class BackendApi {
	constructor(
		private readonly baseUrl: string,
		private readonly fetchApi: typeof fetch = fetch,
	) {}

	async request<Result>(
		path: string,
		body?: Record<string, string>,
	): Promise<Result> {
		const response = await this.fetchApi(new URL(path, this.baseUrl), {
			method: body ? "POST" : "GET",
			headers: { "Content-Type": "application/json" },
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) {
			const payload: unknown = await response.json().catch(() => null);
			const error = payload && typeof payload === "object" ? payload : {};
			const details =
				"details" in error && error.details && typeof error.details === "object"
					? Object.fromEntries(
							Object.entries(error.details).filter(
								(entry): entry is [string, string[]] =>
									Array.isArray(entry[1]) &&
									entry[1].every(
										(message: unknown) => typeof message === "string",
									),
							),
						)
					: {};
			throw new BackendApiError(
				response.status,
				"error" in error && typeof error.error === "string"
					? error.error
					: "Request failed",
				details,
			);
		}
		return response.json() as Promise<Result>;
	}
}
