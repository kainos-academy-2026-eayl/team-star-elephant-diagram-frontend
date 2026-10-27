import type { BackendApi } from "../backendApi";

export class AuthService {
	constructor(private readonly api: BackendApi) {}

	async register(details: Record<string, string>): Promise<void> {
		await this.api.request("/register", details);
	}

	async login(details: Record<string, string>): Promise<string[]> {
		const { cookies } = await this.api.requestWithResponse<unknown>(
			"/login",
			details,
		);
		return cookies;
	}

	async forgotPassword(details: Record<string, string>): Promise<void> {
		await this.api.request("/forgot-password", details);
	}

	async resetPassword(details: Record<string, string>): Promise<void> {
		await this.api.request("/reset-password", details);
	}
}
