import type { BackendApi } from "../backendApi";
import type { LoginResponse } from "./sessionService";

export class AuthService {
	constructor(private readonly api: BackendApi) {}

	async register(details: Record<string, string>): Promise<void> {
		await this.api.request("/register", details);
	}

	async login(details: Record<string, string>, admin = false) {
		return this.api.requestWithResponse<LoginResponse>(
			admin ? "/admin/login" : "/login",
			details,
		);
	}

	async forgotPassword(details: Record<string, string>): Promise<void> {
		await this.api.request("/forgot-password", details);
	}

	async resetPassword(details: Record<string, string>): Promise<void> {
		await this.api.request("/reset-password", details);
	}
}
