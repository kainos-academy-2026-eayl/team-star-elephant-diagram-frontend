import { rateLimit } from "express-rate-limit";

export function createRateLimiter(limit: number) {
	return rateLimit({
		windowMs: 15 * 60 * 1000,
		limit,
		standardHeaders: "draft-8",
		legacyHeaders: false,
	});
}
