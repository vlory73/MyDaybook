/** Undo toasts replace "Are you sure?" dialogs for non-destructive actions (spec: interaction rules). */
export type Toast = { id: number; message: string; undo?: () => void };

export const toasts = $state<{ current: Toast | null }>({ current: null });

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, undo?: () => void, durationMs = 5000): void {
	clearTimeout(timer);
	toasts.current = { id: nextId++, message, undo };
	timer = setTimeout(dismissToast, durationMs);
}

export function dismissToast(): void {
	clearTimeout(timer);
	toasts.current = null;
}
