import { useThemeContext } from '../contexts/ThemeContext';

/**
 * Hook to access and control the theme system
 *
 * @returns {Object} Theme utilities and state
 * @returns {ThemeMode} theme - Current theme mode ('void-protocol' | 'daylight' | 'slate' | 'custom')
 * @returns {DensityMode} density - Current density mode ('spacious' | 'adaptive' | 'dense')
 * @returns {AtmosphereMode} atmosphere - Current atmosphere mode ('full' | 'minimal' | 'none')
 * @returns {CustomThemeColors} customColors - Custom theme color configuration
 * @returns {Function} setTheme - Function to change the theme mode
 * @returns {Function} setDensity - Function to change the density mode
 * @returns {Function} setAtmosphere - Function to change the atmosphere mode
 * @returns {Function} setCustomColors - Function to update custom theme colors
 * @returns {boolean} isLoading - Whether theme operations are in progress
 *
 * @example
 * const { theme, density, atmosphere, setTheme } = useTheme();
 *
 * // Change theme
 * await setTheme('daylight');
 *
 * // Change density
 * await setDensity('dense');
 *
 * // Change atmosphere
 * await setAtmosphere('minimal');
 */
export const useTheme = () => {
  return useThemeContext();
};
