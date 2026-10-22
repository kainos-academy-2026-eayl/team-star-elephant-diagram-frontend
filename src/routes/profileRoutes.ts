import { Router } from "express";
import type { ProfileController } from "../controllers/profileController";

export function createProfileRoutes(
    profileController: ProfileController,
): Router {
    const router = Router();

    router.get("/profile", (req, res) =>
        profileController.getProfile(req, res),
    );

    return router;
}