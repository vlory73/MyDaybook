/** Svelte actions shared by the account screens. */

/** Moves focus to the element when it appears: the step heading, so screen readers announce each step. */
export function focusOnMount(node: HTMLElement): void {
	node.focus({ preventScroll: false });
}

/** Moves the element to <body>, so a print stylesheet can show it alone. Removed again on destroy. */
export function toBody(node: HTMLElement): { destroy: () => void } {
	document.body.appendChild(node);
	return { destroy: () => node.remove() };
}
