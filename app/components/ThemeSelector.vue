<script setup lang="ts">
const { themeStyle, themeMode, setThemeStyle, setThemeMode, isDark } = useTheme();

const themes = [
	{ id: 'classic', label: 'Classic', description: 'Cream & Serif' },
	{ id: 'modern', label: 'Modern', description: 'White & Cyan' },
] as const;
</script>

<template>
	<div class="theme-selector">
		<div class="theme-selector__label">Theme Style</div>

		<!-- Theme Style Buttons -->
		<div class="theme-selector__options">
			<button
				v-for="theme in themes"
				:key="theme.id"
				class="theme-option"
				:class="{ active: themeStyle === theme.id }"
				@click="setThemeStyle(theme.id)">
				<span class="theme-option__icon">
					<span v-if="theme.id === 'classic'" class="icon-classic">Aa</span>
					<Icon v-else name="i-heroicons-square-3-stack-3d" class="w-4 h-4" />
				</span>
				<span class="theme-option__text">
					<span class="theme-option__label">{{ theme.label }}</span>
					<span class="theme-option__desc">{{ theme.description }}</span>
				</span>
			</button>
		</div>

		<!-- Mode Toggle -->
		<div class="theme-selector__mode">
			<button class="mode-toggle" :class="{ dark: isDark }" @click="setThemeMode(isDark ? 'light' : 'dark')">
				<span class="mode-toggle__track">
					<span class="mode-toggle__thumb">
						<Icon :name="isDark ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="w-3 h-3" />
					</span>
				</span>
				<span class="uppercase tracking-wider mode-toggle__label">{{ isDark ? 'Dark' : 'Light' }} Mode</span>
			</button>
		</div>
	</div>
</template>

<style scoped>
.theme-selector {
	padding: 1rem 0;
}

.theme-selector__label {
	font-size: 10px;
	letter-spacing: 0.3em;
	text-transform: uppercase;
	color: var(--theme-text-muted, #9a9a9a);
	margin-bottom: 0.75rem;
}

.theme-selector__options {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.theme-option {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.625rem 0.75rem;
	border-radius: 8px;
	border: 1px solid var(--theme-border-primary, #e5e0d8);
	background: var(--theme-bg-elevated, #ffffff);
	cursor: pointer;
	transition: all 0.2s ease;
	text-align: left;
}

.theme-option:hover {
	border-color: var(--theme-accent-primary, #c9a96e);
}

.theme-option.active {
	border-color: var(--theme-accent-primary, #c9a96e);
	background: var(--theme-bg-secondary, #f5f3ef);
}

.theme-option__icon {
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 6px;
	background: var(--theme-bg-tertiary, #ede9e3);
	color: var(--theme-text-secondary, #6c6c6c);
}

.icon-classic {
	font-family: 'Bauer Bodoni Pro_1 W05 Roman', serif;
	font-size: 14px;
}

.theme-option__text {
	display: flex;
	flex-direction: column;
}

.theme-option__label {
	font-size: 13px;
	font-weight: 500;
	color: var(--theme-text-primary, #454545);
}

.theme-option__desc {
	font-size: 11px;
	color: var(--theme-text-muted, #9a9a9a);
}

.theme-selector__mode {
	margin-top: 0.5rem;
}

.mode-toggle {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	cursor: pointer;
	background: none;
	border: none;
	padding: 0.375rem 0;
	width: 100%;
}

.mode-toggle__track {
	width: 40px;
	height: 22px;
	border-radius: 11px;
	background: var(--theme-border-secondary, #d4cfc7);
	position: relative;
	transition: background 0.2s ease;
}

.mode-toggle.dark .mode-toggle__track {
	background: var(--theme-accent-primary, #c9a96e);
}

.mode-toggle__thumb {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: var(--theme-bg-elevated, #ffffff);
	display: flex;
	align-items: center;
	justify-content: center;
	transition: transform 0.2s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.mode-toggle.dark .mode-toggle__thumb {
	transform: translateX(18px);
}

.mode-toggle__thumb :deep(svg) {
	color: var(--theme-text-secondary, #6c6c6c);
}

.mode-toggle.dark .mode-toggle__thumb :deep(svg) {
	color: var(--theme-accent-tertiary, #8b7355);
}

.mode-toggle__label {
	font-size: 13px;
	color: var(--theme-text-secondary, #6c6c6c);
}
</style>
