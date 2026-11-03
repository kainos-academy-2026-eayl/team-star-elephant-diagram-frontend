(() => {
	const body = document.body;
	const menu = document.getElementById("site-menu");
	const overlay = document.getElementById("menu-overlay");
	const openButton = document.getElementById("menu-open");
	const closeButton = document.getElementById("menu-close");
	const background = document.querySelectorAll(".site-header, main");

	const setMenu = (open) => {
		body.classList.toggle("menu-open", open);
		menu.toggleAttribute("inert", !open);
		for (const region of background) region.toggleAttribute("inert", open);
		menu.setAttribute("aria-hidden", String(!open));
		openButton.setAttribute("aria-expanded", String(open));
		if (open) {
			overlay.hidden = false;
			requestAnimationFrame(() => overlay.classList.add("is-visible"));
			closeButton.focus();
		} else {
			overlay.classList.remove("is-visible");
			setTimeout(() => {
				if (!body.classList.contains("menu-open")) overlay.hidden = true;
			}, 250);
			openButton.focus();
		}
	};

	openButton.addEventListener("click", () => setMenu(true));
	closeButton.addEventListener("click", () => setMenu(false));
	overlay.addEventListener("click", () => setMenu(false));
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && body.classList.contains("menu-open")) {
			setMenu(false);
		}
	});

	const slides = [...document.querySelectorAll(".carousel__slide")];
	const dotsContainer = document.querySelector(".carousel__dots");
	const arrows = document.querySelectorAll(".carousel__arrow");
	let current = 0;
	let timer;

	if (slides.length < 2) {
		dotsContainer.hidden = true;
		for (const arrow of arrows) arrow.hidden = true;
		return;
	}

	const dots = slides.map((_, index) => {
		const dot = document.createElement("button");
		dot.type = "button";
		dot.className = "carousel__dot";
		dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
		dot.addEventListener("click", () => show(index, true));
		dotsContainer.append(dot);
		return dot;
	});

	function show(index, userInitiated = false) {
		current = (index + slides.length) % slides.length;
		slides.forEach((slide, i) => {
			const active = i === current;
			slide.classList.toggle("is-active", active);
			slide.setAttribute("aria-hidden", String(!active));
			slide.tabIndex = active ? 0 : -1;
			dots[i].setAttribute("aria-current", String(active));
		});
		if (userInitiated) restart();
	}

	function restart() {
		clearInterval(timer);
		if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			timer = setInterval(() => show(current + 1), 6000);
		}
	}

	document
		.querySelector(".carousel__arrow--prev")
		.addEventListener("click", () => show(current - 1, true));
	document
		.querySelector(".carousel__arrow--next")
		.addEventListener("click", () => show(current + 1, true));

	show(0);
	restart();
})();
