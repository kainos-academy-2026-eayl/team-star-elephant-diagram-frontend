// Saves basket quantity changes automatically, without an Update button.
const SAVE_DELAY_MS = 600;

for (const form of document.querySelectorAll(".basket-item__quantity")) {
	const input = form.querySelector('input[name="quantity"]');
	if (!input) continue;
	let timer;

	const save = () => {
		clearTimeout(timer);
		if (input.value === input.defaultValue || !form.checkValidity()) return;
		input.readOnly = true;
		form.requestSubmit();
	};

	// Wait for typing or repeated arrow clicks to settle before saving.
	input.addEventListener("input", () => {
		clearTimeout(timer);
		timer = setTimeout(save, SAVE_DELAY_MS);
	});
	input.addEventListener("change", save);
}
