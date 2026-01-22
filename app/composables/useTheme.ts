// Theme composable for managing design themes
// Three themes: 'classic' (cream/serif), 'modern' (white/grey/sans-serif/cyan), 'luxury' (gallery white/brass/premium)
// Each theme has light and dark mode variants

export type ThemeStyle = 'classic' | 'modern' | 'luxury';
export type ThemeMode = 'light' | 'dark';

export interface ThemeState {
	style: ThemeStyle;
	mode: ThemeMode;
}

// Theme metadata for UI display
export interface ThemeOption {
	id: ThemeStyle;
	label: string;
	description: string;
	isPremium: boolean;
}

export const THEME_OPTIONS: ThemeOption[] = [
	{ id: 'classic', label: 'Classic', description: 'Cream & Serif', isPremium: false },
	{ id: 'modern', label: 'Modern', description: 'White & Cyan', isPremium: false },
	{ id: 'luxury', label: 'Luxury', description: 'Gallery & Brass', isPremium: true },
];

const THEME_STORAGE_KEY = 'design-theme';

// Get stored theme or default
function getStoredTheme(): ThemeState {
	if (import.meta.client) {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				// Validate the stored style is still valid
				if (['classic', 'modern', 'luxury'].includes(parsed.style)) {
					return parsed;
				}
			} catch {
				// Invalid stored value, use default
			}
		}
	}
	return { style: 'classic', mode: 'light' };
}

// Global reactive state
const themeState = reactive<ThemeState>(getStoredTheme());

export function useTheme() {
	const { user } = useDirectusAuth();
	const { updateProfile } = useDirectusUser();

	// Computed theme class for the root element
	const themeClass = computed(() => {
		return `theme-${themeState.style}-${themeState.mode}`;
	});

	// Individual computed refs
	const themeStyle = computed(() => themeState.style);
	const themeMode = computed(() => themeState.mode);
	const isDark = computed(() => themeState.mode === 'dark');
	const isClassic = computed(() => themeState.style === 'classic');
	const isModern = computed(() => themeState.style === 'modern');
	const isLuxury = computed(() => themeState.style === 'luxury');
	const isPremiumTheme = computed(() => themeState.style === 'luxury');

	// Set theme class on html element (works with SSR via useHead)
	function setHtmlThemeClass(style: ThemeStyle, mode: ThemeMode = 'light') {
		const className = `theme-${style}-${mode}`;

		useHead({
			htmlAttrs: {
				class: className,
			},
		});

		// Also update state for client-side reactivity
		themeState.style = style;
		themeState.mode = mode;
	}

	// Set theme style (classic, modern, or luxury)
	async function setThemeStyle(style: ThemeStyle, persist = true) {
		themeState.style = style;
		saveThemeLocal();
		applyTheme();

		// Persist to Directus if user is logged in
		if (persist && user.value) {
			try {
				await updateProfile({ theme_light: style });
			} catch (e) {
				console.warn('Failed to save theme preference to server:', e);
			}
		}
	}

	// Set theme mode (light or dark)
	async function setThemeMode(mode: ThemeMode, persist = true) {
		themeState.mode = mode;
		saveThemeLocal();
		applyTheme();

		// Persist to Directus if user is logged in
		if (persist && user.value) {
			try {
				await updateProfile({ appearance: mode });
			} catch (e) {
				console.warn('Failed to save theme mode to server:', e);
			}
		}
	}

	// Toggle between light and dark mode
	function toggleMode() {
		setThemeMode(themeState.mode === 'light' ? 'dark' : 'light');
	}

	// Cycle through theme styles
	function cycleStyle() {
		const styles: ThemeStyle[] = ['classic', 'modern', 'luxury'];
		const currentIndex = styles.indexOf(themeState.style);
		const nextIndex = (currentIndex + 1) % styles.length;
		setThemeStyle(styles[nextIndex]);
	}

	// Set full theme (style + mode)
	async function setTheme(style: ThemeStyle, mode: ThemeMode, persist = true) {
		themeState.style = style;
		themeState.mode = mode;
		saveThemeLocal();
		applyTheme();

		// Persist to Directus if user is logged in
		if (persist && user.value) {
			try {
				await updateProfile({
					theme_light: style,
					appearance: mode,
				});
			} catch (e) {
				console.warn('Failed to save theme to server:', e);
			}
		}
	}

	// Force a specific theme style without persisting (useful for public pages like sell-sheet)
	// This uses useHead so it works with SSR
	function forceThemeStyle(style: ThemeStyle, mode: ThemeMode = 'light') {
		themeState.style = style;
		themeState.mode = mode;

		// Use useHead to set the class - this works on both SSR and client
		useHead({
			htmlAttrs: {
				class: `theme-${style}-${mode}`,
			},
		});

		// Also apply directly on client for immediate effect
		if (import.meta.client) {
			applyTheme();
		}
	}

	// Save theme to localStorage
	function saveThemeLocal() {
		if (import.meta.client) {
			localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeState));
		}
	}

	// Apply theme classes to document (client-side only)
	function applyTheme() {
		if (import.meta.client) {
			const html = document.documentElement;

			// Remove all theme classes
			html.classList.remove(
				'theme-classic-light',
				'theme-classic-dark',
				'theme-modern-light',
				'theme-modern-dark',
				'theme-luxury-light',
				'theme-luxury-dark'
			);

			// Add current theme class
			html.classList.add(`theme-${themeState.style}-${themeState.mode}`);

			// Sync dark class for Tailwind
			if (themeState.mode === 'dark') {
				html.classList.add('dark');
			} else {
				html.classList.remove('dark');
			}
		}
	}

	// Initialize theme on mount - loads from user profile if logged in, otherwise localStorage
	async function initTheme() {
		if (import.meta.client) {
			// First, apply stored local theme for immediate display
			const stored = getStoredTheme();
			themeState.style = stored.style;
			themeState.mode = stored.mode;
			applyTheme();

			// If user is logged in, check if they have a saved preference
			if (user.value) {
				// Get theme style from user's theme_light field
				const userStyle = user.value.theme_light as ThemeStyle | undefined;
				const userMode = user.value.appearance as ThemeMode | undefined;

				if (userStyle && ['classic', 'modern', 'luxury'].includes(userStyle)) {
					themeState.style = userStyle;
				}

				if (userMode && (userMode === 'light' || userMode === 'dark')) {
					themeState.mode = userMode;
				}

				saveThemeLocal();
				applyTheme();
			}
		}
	}

	// Load user theme from profile (call after login)
	async function loadUserTheme() {
		if (user.value) {
			const userStyle = user.value.theme_light as ThemeStyle | undefined;
			const userMode = user.value.appearance as ThemeMode | undefined;

			if (userStyle && ['classic', 'modern', 'luxury'].includes(userStyle)) {
				themeState.style = userStyle;
			}

			if (userMode && (userMode === 'light' || userMode === 'dark')) {
				themeState.mode = userMode;
			}

			saveThemeLocal();
			applyTheme();
		}
	}

	// Check if a theme style requires premium subscription
	function isPremiumRequired(style: ThemeStyle): boolean {
		return style === 'luxury';
	}

	// Get available themes based on subscription tier
	function getAvailableThemes(hasPremium: boolean): ThemeOption[] {
		return THEME_OPTIONS.filter(theme => !theme.isPremium || hasPremium);
	}

	return {
		// State
		themeState,
		themeClass,
		themeStyle,
		themeMode,
		isDark,
		isClassic,
		isModern,
		isLuxury,
		isPremiumTheme,

		// Theme options
		THEME_OPTIONS,

		// Actions
		setThemeStyle,
		setThemeMode,
		toggleMode,
		cycleStyle,
		setTheme,
		forceThemeStyle,
		setHtmlThemeClass,
		initTheme,
		applyTheme,
		loadUserTheme,

		// Premium helpers
		isPremiumRequired,
		getAvailableThemes,
	};
}
