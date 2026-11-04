const MAX_RETURN_TO_LENGTH = 200;
const VALIDATION_ORIGIN = "http://return-to.invalid";

const isAdminPath = (path: string): boolean =>
	path === "/admin" || path.startsWith("/admin/");

const hasControlCharacters = (value: string): boolean =>
	[...value].some((character) => {
		const code = character.charCodeAt(0);
		return code < 0x20 || code === 0x7f;
	});

// Only same-site /admin pages are accepted so returnTo cannot become an open redirect.
export function safeAdminReturnTo(value: unknown): string | undefined {
	if (
		typeof value !== "string" ||
		value.length > MAX_RETURN_TO_LENGTH ||
		!isAdminPath(value) ||
		value.startsWith("//") ||
		value.includes("\\") ||
		value.includes("://") ||
		hasControlCharacters(value)
	) {
		return undefined;
	}
	let url: URL;
	try {
		url = new URL(value, VALIDATION_ORIGIN);
	} catch {
		return undefined;
	}
	const path = url.pathname.toLowerCase().replace(/\/+$/, "");
	if (
		url.origin !== VALIDATION_ORIGIN ||
		!isAdminPath(url.pathname) ||
		path === "/admin/login"
	) {
		return undefined;
	}
	return `${url.pathname}${url.search}`;
}
