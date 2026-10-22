import type { BackendApi } from "../backendApi";

export class AuthService {
	constructor(private readonly api: BackendApi) {}

	async register(details: Record<string, string>): Promise<void> {
		await this.api.request("/register", details);
	}

	async login(details: Record<string, string>): Promise<void> {
		await this.api.request("/login", details);
	}
}
