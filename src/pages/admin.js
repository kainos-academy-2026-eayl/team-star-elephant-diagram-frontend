// Admin pages are server-rendered, so show a loading state while the next page is requested.
const LOADING_CLASS = "admin-loading";
const LOADING_TIMEOUT_MS = 15000;
const root = document.documentElement;
const busyControls = new Set();
let timeout;

const progress = document.createElement("div");
progress.className = "admin-progress";
progress.setAttribute("aria-hidden", "true");

const announcer = document.createElement("div");
announcer.className = "visually-hidden";
announcer.setAttribute("role", "status");
announcer.setAttribute("aria-live", "polite");

document.body.append(progress, announcer);

const stopLoading = () => {
	clearTimeout(timeout);
	root.classList.remove(LOADING_CLASS);
	document.querySelector("main")?.removeAttribute("aria-busy");
	announcer.textContent = "";
	for (const control of busyControls) {
		control.removeAttribute("aria-disabled");
		control.removeAttribute("data-loading-label");
	}
	busyControls.clear();
};

const startLoading = (control) => {
	root.classList.add(LOADING_CLASS);
	document.querySelector("main")?.setAttribute("aria-busy", "true");
	announcer.textContent = "Loading, please wait.";
	if (control) {
		control.setAttribute("aria-disabled", "true");
		control.setAttribute("data-loading-label", "");
		busyControls.add(control);
	}
	// Keep controls usable if the request never completes (e.g. the connection drops).
	clearTimeout(timeout);
	timeout = setTimeout(stopLoading, LOADING_TIMEOUT_MS);
};

document.addEventListener("submit", (event) => {
	if (event.defaultPrevented) return;
	// Prevent duplicate submissions such as a double-clicked suspend action.
	if (root.classList.contains(LOADING_CLASS)) {
		event.preventDefault();
		return;
	}
	startLoading(
		event.submitter ?? event.target.querySelector('[type="submit"]'),
	);
});

document.addEventListener("click", (event) => {
	if (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	) {
		return;
	}
	const link = event.target.closest?.("a[href]");
	if (!link || link.hasAttribute("download")) return;
	if (link.target && link.target !== "_self") return;
	const url = new URL(link.href, window.location.href);
	if (url.origin !== window.location.origin) return;
	if (
		url.hash &&
		url.pathname === window.location.pathname &&
		url.search === window.location.search
	) {
		return;
	}
	startLoading(link.matches(".admin-btn, .admin-alert a") ? link : null);
});

// Restore the page when it is shown again from the back/forward cache.
window.addEventListener("pageshow", stopLoading);

// Selects marked data-autosubmit (e.g. the inventory sort) apply immediately.
document.addEventListener("change", (event) => {
	event.target.closest?.("select[data-autosubmit]")?.form?.requestSubmit();
});
