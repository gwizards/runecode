import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

// ===== Types =====
export type ThemeMode = 'void-protocol' | 'daylight' | 'slate' | 'custom';
export type DensityMode = 'spacious' | 'adaptive' | 'dense';
export type AtmosphereMode = 'full' | 'minimal' | 'none';

export interface CustomThemeColors {
  voidDeep: string;
  voidBase: string;
  voidRaised: string;
  voidElevated: string;
  voidOverlay: string;
  purple400: string;
  purple500: string;
  purple600: string;
  gold300: string;
  gold400: string;
  gold500: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  density: DensityMode;
  atmosphere: AtmosphereMode;
  customColors: CustomThemeColors;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setDensity: (density: DensityMode) => Promise<void>;
  setAtmosphere: (atmosphere: AtmosphereMode) => Promise<void>;
  setCustomColors: (colors: Partial<CustomThemeColors>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ===== Storage Keys =====
const THEME_STORAGE_KEY = 'theme_preference';
const DENSITY_STORAGE_KEY = 'density_preference';
const ATMOSPHERE_STORAGE_KEY = 'atmosphere_preference';
const CUSTOM_COLORS_STORAGE_KEY = 'theme_custom_colors';

// ===== Migration Map (old → new) =====
const THEME_MIGRATION: Record<string, ThemeMode> = {
  dark: 'void-protocol',
  gray: 'slate',
  light: 'daylight',
  white: 'daylight',
  custom: 'custom',
  // New values pass through
  'void-protocol': 'void-protocol',
  daylight: 'daylight',
  slate: 'slate',
};

// ===== Default Custom Colors =====
const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  voidDeep: 'oklch(0.05 0.02 285)',
  voidBase: 'oklch(0.06 0.02 285)',
  voidRaised: 'oklch(0.10 0.02 285)',
  voidElevated: 'oklch(0.14 0.025 288)',
  voidOverlay: 'oklch(0.18 0.02 285)',
  purple400: 'oklch(0.72 0.22 292)',
  purple500: 'oklch(0.62 0.28 292)',
  purple600: 'oklch(0.52 0.26 292)',
  gold300: 'oklch(0.85 0.12 80)',
  gold400: 'oklch(0.78 0.15 80)',
  gold500: 'oklch(0.70 0.17 75)',
  textPrimary: 'oklch(0.93 0.01 285)',
  textSecondary: 'oklch(0.70 0.02 285)',
  textMuted: 'oklch(0.50 0.02 285)',
  borderSubtle: 'oklch(0.20 0.02 285)',
};

// ===== Custom color key → CSS variable mapping =====
const CUSTOM_COLOR_CSS_MAP: Record<keyof CustomThemeColors, string> = {
  voidDeep: '--color-void-deep',
  voidBase: '--color-void-base',
  voidRaised: '--color-void-raised',
  voidElevated: '--color-void-elevated',
  voidOverlay: '--color-void-overlay',
  purple400: '--color-purple-400',
  purple500: '--color-purple-500',
  purple600: '--color-purple-600',
  gold300: '--color-gold-300',
  gold400: '--color-gold-400',
  gold500: '--color-gold-500',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  borderSubtle: '--color-border-subtle',
};

// ===== Detection Helpers =====
function detectDefaultTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'daylight';
  }
  return 'void-protocol';
}

function detectDefaultAtmosphere(): AtmosphereMode {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return 'none';
  }
  return 'full';
}

function migrateTheme(saved: string): ThemeMode {
  return THEME_MIGRATION[saved] ?? 'void-protocol';
}

// ===== Apply Functions =====
function applyTheme(themeMode: ThemeMode, colors: CustomThemeColors) {
  const root = document.documentElement;

  // Remove legacy classes
  root.classList.remove('theme-dark', 'theme-gray', 'theme-light', 'theme-white', 'theme-custom');

  // Set data-theme attribute
  root.setAttribute('data-theme', themeMode);

  // Apply or clear custom colors
  if (themeMode === 'custom') {
    for (const [key, cssVar] of Object.entries(CUSTOM_COLOR_CSS_MAP)) {
      root.style.setProperty(cssVar, colors[key as keyof CustomThemeColors]);
    }
  } else {
    for (const cssVar of Object.values(CUSTOM_COLOR_CSS_MAP)) {
      root.style.removeProperty(cssVar);
    }
  }
}

function applyDensity(density: DensityMode) {
  document.documentElement.setAttribute('data-density', density);
}

function applyAtmosphere(atmosphere: AtmosphereMode) {
  document.documentElement.setAttribute('data-atmosphere', atmosphere);
}

// ===== Provider =====
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('void-protocol');
  const [density, setDensityState] = useState<DensityMode>('adaptive');
  const [atmosphere, setAtmosphereState] = useState<AtmosphereMode>('full');
  const [customColors, setCustomColorsState] = useState<CustomThemeColors>(DEFAULT_CUSTOM_COLORS);
  const [isLoading, setIsLoading] = useState(true);

  // Load all preferences from storage
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // Load theme
        const savedTheme = await api.getSetting(THEME_STORAGE_KEY);
        const resolvedTheme = savedTheme ? migrateTheme(savedTheme) : detectDefaultTheme();

        // If we migrated, save the new value
        if (savedTheme && migrateTheme(savedTheme) !== savedTheme) {
          await api.saveSetting(THEME_STORAGE_KEY, resolvedTheme);
        }

        setThemeState(resolvedTheme);

        // Load custom colors
        const savedColors = await api.getSetting(CUSTOM_COLORS_STORAGE_KEY);
        let colors = DEFAULT_CUSTOM_COLORS;
        if (savedColors) {
          try {
            colors = { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(savedColors) };
          } catch {
            // Invalid JSON, use defaults
          }
        }
        setCustomColorsState(colors);

        // Apply theme
        applyTheme(resolvedTheme, colors);

        // Load density
        const savedDensity = await api.getSetting(DENSITY_STORAGE_KEY);
        const resolvedDensity = (savedDensity as DensityMode) || 'adaptive';
        setDensityState(resolvedDensity);
        applyDensity(resolvedDensity);

        // Load atmosphere
        const savedAtmosphere = await api.getSetting(ATMOSPHERE_STORAGE_KEY);
        const resolvedAtmosphere = savedAtmosphere
          ? (savedAtmosphere as AtmosphereMode)
          : detectDefaultAtmosphere();
        setAtmosphereState(resolvedAtmosphere);
        applyAtmosphere(resolvedAtmosphere);
      } catch (error) {
        console.error('Failed to load theme settings:', error);
        // Apply sensible defaults
        applyTheme(detectDefaultTheme(), DEFAULT_CUSTOM_COLORS);
        applyDensity('adaptive');
        applyAtmosphere(detectDefaultAtmosphere());
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Listen for reduced-motion changes at runtime
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't explicitly set atmosphere
      api.getSetting(ATMOSPHERE_STORAGE_KEY).then((saved) => {
        if (!saved) {
          const newAtm: AtmosphereMode = e.matches ? 'none' : 'full';
          setAtmosphereState(newAtm);
          applyAtmosphere(newAtm);
        }
      }).catch(console.warn);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback(
    async (newTheme: ThemeMode) => {
      try {
        setIsLoading(true);
        setThemeState(newTheme);
        applyTheme(newTheme, customColors);
        await api.saveSetting(THEME_STORAGE_KEY, newTheme);
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [customColors]
  );

  const setDensity = useCallback(async (newDensity: DensityMode) => {
    try {
      setDensityState(newDensity);
      applyDensity(newDensity);
      await api.saveSetting(DENSITY_STORAGE_KEY, newDensity);
    } catch (error) {
      console.error('Failed to save density preference:', error);
    }
  }, []);

  const setAtmosphere = useCallback(async (newAtmosphere: AtmosphereMode) => {
    try {
      setAtmosphereState(newAtmosphere);
      applyAtmosphere(newAtmosphere);
      await api.saveSetting(ATMOSPHERE_STORAGE_KEY, newAtmosphere);
    } catch (error) {
      console.error('Failed to save atmosphere preference:', error);
    }
  }, []);

  const setCustomColors = useCallback(
    async (colors: Partial<CustomThemeColors>) => {
      try {
        setIsLoading(true);
        const newColors = { ...customColors, ...colors };
        setCustomColorsState(newColors);

        if (theme === 'custom') {
          applyTheme('custom', newColors);
        }

        await api.saveSetting(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(newColors));
      } catch (error) {
        console.error('Failed to save custom colors:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [theme, customColors]
  );

  const value: ThemeContextType = {
    theme,
    density,
    atmosphere,
    customColors,
    setTheme,
    setDensity,
    setAtmosphere,
    setCustomColors,
    isLoading,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

// Convenience alias
export const useTheme = useThemeContext;
