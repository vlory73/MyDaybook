<script lang="ts">
	/** Our own simple drawings for the seven stool types (not the published Bristol artwork). */
	let { type, width = 44, height = 28 }: { type: number; width?: number; height?: number } = $props();
</script>

<svg viewBox="0 0 40 26" {width} {height} fill="currentColor" aria-hidden="true">
	{#if type === 1}
		<circle cx="10" cy="14" r="4" /><circle cx="20" cy="11" r="3.5" /><circle cx="29" cy="15" r="4" /><circle
			cx="18"
			cy="20"
			r="3"
		/>
	{:else if type === 2}
		<path d="M6 15c0-4 3-6 6-5 2-3 6-3 8 0 3-2 7-1 8 2 3 1 4 5 2 7-1 3-5 3-7 2-2 2-6 2-8 0-3 1-7 0-9-6z" />
	{:else if type === 3}
		<rect x="5" y="9" width="30" height="11" rx="5.5" />
		<path d="M13 9v3M20 20v-3M27 9v3" stroke="var(--gut-tint)" stroke-width="1.6" />
	{:else if type === 4}
		<path
			d="M6 17c4-7 10-7 14-3s10 4 14-3"
			stroke="currentColor"
			stroke-width="7"
			fill="none"
			stroke-linecap="round"
		/>
	{:else if type === 5}
		<ellipse cx="10" cy="15" rx="5" ry="4" /><ellipse cx="21" cy="12" rx="5" ry="4" /><ellipse
			cx="30"
			cy="17"
			rx="5"
			ry="4"
		/>
	{:else if type === 6}
		<path d="M5 18c2-6 6-4 8-7 3 3 5-1 8 2 2-3 6-1 7 1 3 0 6 2 6 5-4 3-25 3-29-1z" />
	{:else}
		<path
			d="M12 6c3 5 5 7 5 10a5 5 0 0 1-10 0c0-3 2-5 5-10zM27 9c2.5 4 4 6 4 8.5a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8.5z"
		/>
	{/if}
</svg>
