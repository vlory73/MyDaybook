<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		disabled = false,
		onchange
	}: {
		checked?: boolean;
		label: string;
		disabled?: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	class="toggle"
	class:on={checked}
	{disabled}
	onclick={() => {
		checked = !checked;
		onchange?.(checked);
	}}
></button>

<style>
	.toggle {
		width: 51px;
		height: 31px;
		border-radius: 16px;
		background: var(--surface-3);
		position: relative;
		flex: none;
		transition: background var(--dur-2) var(--ease-out);
	}
	.toggle::after {
		content: '';
		position: absolute;
		left: 2px;
		top: 2px;
		width: 27px;
		height: 27px;
		border-radius: 50%;
		background: #fff;
		box-shadow: var(--shadow-1);
		transition: transform var(--dur-2) var(--ease-out);
	}
	.toggle:disabled {
		opacity: 0.5;
	}
	.on {
		background: var(--meds-ink);
	}
	.on::after {
		transform: translateX(20px);
	}
</style>
