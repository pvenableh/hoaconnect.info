// Theme composable for managing design themes
// Two themes: 'classic' (cream/serif) and 'modern' (white/grey/sans-serif/cyan)
// Each theme has light and dark mode variants

export type ThemeStyle = 'classic' | 'modern';
export type ThemeMode = 'light' | 'dark';

export interface ThemeState {
	style: ThemeStyle;
	mode: ThemeMode;
}

const THEME_STORAGE_KEY = 'design-theme';

// Get stored theme or default
function getStoredTheme(): ThemeState {
	if (import.meta.client) {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored) {
			try {
				return JSON.parse(stored);
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
	const { user, refreshUser } = useDirectusAuth();
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

	// Set theme style (classic or modern)
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

	// Toggle between classic and modern theme
	function toggleStyle() {
		setThemeStyle(themeState.style === 'classic' ? 'modern' : 'classic');
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
	function forceThemeStyle(style: ThemeStyle) {
		themeState.style = style;
		applyTheme();
	}

	// Save theme to localStorage
	function saveThemeLocal() {
		if (import.meta.client) {
			localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themeState));
		}
	}

	// Apply theme classes to document
	function applyTheme() {
		if (import.meta.client) {
			const html = document.documentElement;

			// Remove all theme classes
			html.classList.remove(
				'theme-classic-light',
				'theme-classic-dark',
				'theme-modern-light',
				'theme-modern-dark'
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
				// Get theme style from user's theme_light field (we repurpose this for style)
				const userStyle = user.value.theme_light as ThemeStyle | undefined;
				const userMode = user.value.appearance as ThemeMode | undefined;

				if (userStyle && (userStyle === 'classic' || userStyle === 'modern')) {
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

			if (userStyle && (userStyle === 'classic' || userStyle === 'modern')) {
				themeState.style = userStyle;
			}

			if (userMode && (userMode === 'light' || userMode === 'dark')) {
				themeState.mode = userMode;
			}

			saveThemeLocal();
			applyTheme();
		}
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

		// Actions
		setThemeStyle,
		setThemeMode,
		toggleMode,
		toggleStyle,
		setTheme,
		forceThemeStyle,
		initTheme,
		applyTheme,
		loadUserTheme,
	};
}
