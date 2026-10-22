import type { BackendApi } from "../backendApi";
import type { ProfileData } from "../models/profile";

export class ProfileService {
    constructor(private readonly api: BackendApi) { }

    getProfile(): Promise<ProfileData> {
        return this.api.request<ProfileData>("/profile");
    }
}