<script lang="ts">
	import { base } from '$app/paths';
	import type { IconName } from './icon-names';

	let { name, size = 22, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<!-- Decorative unless a label is given; buttons carry their own accessible names. -->
<svg
	class="icon"
	width={size}
	height={size}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<use href="{base}/icons.svg#{name}" />
</svg>

<style>
	.icon {
		flex: none;
		display: inline-block;
		vertical-align: middle;
	}
</style>
