/**
 * AppearanceSettings — theme, density, atmosphere, and custom colour controls.
 *
 * Sub-components (SegmentedControl, ThemeCard, ColorGroup) and static
 * option definitions live in `appearance/ThemePicker.tsx`.
 */

import React, { useRef, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import type { CustomThemeColors } from '@/contexts/ThemeContext';
import {
  SegmentedControl,
  ThemeCard,
  ColorGroup,
  COLOR_GROUPS,
  THEME_OPTIONS,
  DENSITY_OPTIONS,
  ATMOSPHERE_OPTIONS,
} from './appearance/ThemePicker';

export function AppearanceSettings() {
  const {
    theme, density, atmosphere, customColors,
    setTheme, setDensity, setAtmosphere, setCustomColors,
  } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleColorChange = useCallback(
    (key: keyof CustomThemeColors, value: string) => { setCustomColors({ [key]: value }); },
    [setCustomColors]
  );

  const handleExport = useCallback(() => {
    const json = JSON.stringify(customColors, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'runecode-theme.json'; a.click();
    URL.revokeObjectURL(url);
  }, [customColors]);

  const handleImport = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try { setCustomColors(JSON.parse(event.target?.result as string)); }
        catch { console.error('Invalid theme file'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [setCustomColors]
  );

  const handleReset = useCallback(() => {
    setCustomColors({
      voidDeep: 'oklch(0.05 0.02 285)', voidBase: 'oklch(0.06 0.02 285)',
      voidRaised: 'oklch(0.10 0.02 285)', voidElevated: 'oklch(0.14 0.025 288)',
      voidOverlay: 'oklch(0.18 0.02 285)', purple400: 'oklch(0.72 0.22 292)',
      purple500: 'oklch(0.62 0.28 292)', purple600: 'oklch(0.52 0.26 292)',
      gold300: 'oklch(0.85 0.12 80)', gold400: 'oklch(0.78 0.15 80)',
      gold500: 'oklch(0.70 0.17 75)', textPrimary: 'oklch(0.93 0.01 285)',
      textSecondary: 'oklch(0.70 0.02 285)', textMuted: 'oklch(0.50 0.02 285)',
      borderSubtle: 'oklch(0.20 0.02 285)',
    });
  }, [setCustomColors]);

  const actionButtonStyle: React.CSSProperties = {
    padding: '8px 16px', borderRadius: 8,
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-void-raised)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 12, fontWeight: 500,
    transition: 'background 0.15s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Theme Selector */}
      <section>
        <h3 className="text-heading-3" style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>Theme</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {THEME_OPTIONS.map((opt) => (
            <ThemeCard key={opt.mode} mode={opt.mode} label={opt.label} description={opt.description}
              previewColors={opt.previewColors} isActive={theme === opt.mode} onClick={() => setTheme(opt.mode)} />
          ))}
        </div>
      </section>

      {/* Density Control */}
      <section>
        <h3 className="text-heading-3" style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>Density</h3>
        <SegmentedControl options={DENSITY_OPTIONS} value={density} onChange={setDensity} />
      </section>

      {/* Atmosphere Control */}
      <section>
        <h3 className="text-heading-3" style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>Atmosphere</h3>
        <SegmentedControl options={ATMOSPHERE_OPTIONS} value={atmosphere} onChange={setAtmosphere} />
        <p className="text-caption" style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>
          Automatically set to None when your system requests reduced motion.
        </p>
      </section>

      {/* Custom Theme Editor */}
      {theme === 'custom' && (
        <section>
          <h3 className="text-heading-3" style={{ color: 'var(--color-text-primary)', marginBottom: 12 }}>Custom Theme Editor</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COLOR_GROUPS.map((group) => (
              <ColorGroup key={group.title} title={group.title} colors={group.colors}
                customColors={customColors} onColorChange={handleColorChange} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleExport} style={actionButtonStyle}>Export JSON</button>
            <button onClick={handleImport} style={actionButtonStyle}>Import Theme</button>
            <button onClick={handleReset} style={{ ...actionButtonStyle, borderColor: 'var(--color-purple-500)', color: 'var(--color-purple-400)' }}>Reset</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>
        </section>
      )}
    </div>
  );
}
