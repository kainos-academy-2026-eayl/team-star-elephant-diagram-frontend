// End-to-end test runs log in far more often than real users, so RATE_LIMIT_MAX can replace every per-IP limit outside production.
export function rateLimitMax(defaultLimit: number): number {
	const override = Number(process.env.RATE_LIMIT_MAX);
	return process.env.NODE_ENV !== "production" &&
		Number.isInteger(override) &&
		override > 0
		? override
		: defaultLimit;
}
