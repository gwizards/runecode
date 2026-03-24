/**
 * Theme picker sub-components extracted from AppearanceSettings.
 * Contains SegmentedControl, ThemeCard, ColorGroup, and all static
 * option/colour-group definitions.
 */

import { useState } from 'react';
import type {
  ThemeMode,
  DensityMode,
  AtmosphereMode,
  CustomThemeColors,
} from '@/contexts/ThemeContext';

// ===== SegmentedControl =====

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      style={{
        display: 'flex',
        borderRadius: 8,
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
        background: 'var(--color-void-deep)',
      }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '8px 16px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              background: isActive ? 'var(--color-purple-500)' : 'transparent',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== ThemeCard =====

interface ThemeCardProps {
  mode: ThemeMode;
  label: string;
  description: string;
  previewColors: [string, string, string];
  isActive: boolean;
  onClick: () => void;
}

export function ThemeCard({
  label,
  description,
  previewColors,
  isActive,
  onClick,
}: ThemeCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        borderRadius: 12,
        border: isActive
          ? '2px solid var(--color-purple-500)'
          : '1px solid var(--color-border-subtle)',
        background: 'var(--color-void-raised)',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: isActive ? '0 0 16px oklch(0.62 0.28 292 / 0.3)' : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 4, height: 24 }}>
        {previewColors.map((color, i) => (
          <div key={i} style={{ flex: 1, borderRadius: 4, background: color }} />
        ))}
      </div>
      <span className="text-label" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
      <span className="text-caption" style={{ color: 'var(--color-text-muted)' }}>{description}</span>
    </button>
  );
}

// ===== ColorGroup =====

interface ColorGroupProps {
  title: string;
  colors: { key: keyof CustomThemeColors; label: string }[];
  customColors: CustomThemeColors;
  onColorChange: (key: keyof CustomThemeColors, value: string) => void;
}

export function ColorGroup({ title, colors, customColors, onColorChange }: ColorGroupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '10px 14px', background: 'var(--color-void-raised)',
          border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)',
          fontSize: 13, fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', fontSize: 12, color: 'var(--color-text-muted)' }}>
          {'\u25B6'}
        </span>
      </button>
      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: 'var(--color-void-deep)' }}>
          {colors.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                value={oklchToHexFallback(customColors[key])}
                onChange={(e) => onColorChange(key, e.target.value)}
                style={{
                  width: 28, height: 28, border: '1px solid var(--color-border-subtle)',
                  borderRadius: 6, padding: 0, cursor: 'pointer', background: 'transparent',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
                <div className="text-caption" style={{ color: 'var(--color-text-muted)', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {customColors[key]}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Helpers =====

function oklchToHexFallback(oklchValue: string): string {
  if (oklchValue.startsWith('#')) return oklchValue;
  return '#6b21a8';
}

// ===== Static definitions =====

export const COLOR_GROUPS: { title: string; colors: { key: keyof CustomThemeColors; label: string }[] }[] = [
  { title: 'Backgrounds', colors: [
    { key: 'voidDeep', label: 'Void Deep' }, { key: 'voidBase', label: 'Void Base' },
    { key: 'voidRaised', label: 'Void Raised' }, { key: 'voidElevated', label: 'Void Elevated' },
    { key: 'voidOverlay', label: 'Void Overlay' },
  ] },
  { title: 'Primary', colors: [
    { key: 'purple400', label: 'Purple 400' }, { key: 'purple500', label: 'Purple 500' },
    { key: 'purple600', label: 'Purple 600' },
  ] },
  { title: 'Accent', colors: [
    { key: 'gold300', label: 'Gold 300' }, { key: 'gold400', label: 'Gold 400' },
    { key: 'gold500', label: 'Gold 500' },
  ] },
  { title: 'Text', colors: [
    { key: 'textPrimary', label: 'Text Primary' }, { key: 'textSecondary', label: 'Text Secondary' },
    { key: 'textMuted', label: 'Text Muted' },
  ] },
  { title: 'Semantic', colors: [{ key: 'borderSubtle', label: 'Border Subtle' }] },
];

export const THEME_OPTIONS: {
  mode: ThemeMode; label: string; description: string;
  previewColors: [string, string, string];
}[] = [
  { mode: 'void-protocol', label: 'Void Protocol', description: 'Deep dark with purple accents', previewColors: ['oklch(0.06 0.02 285)', 'oklch(0.62 0.28 292)', 'oklch(0.78 0.15 80)'] },
  { mode: 'daylight', label: 'Daylight', description: 'Clean light theme for bright environments', previewColors: ['#f8f9fa', '#6b21a8', '#d4a574'] },
  { mode: 'slate', label: 'Slate', description: 'Neutral mid-tone gray palette', previewColors: ['#1e293b', '#7c3aed', '#f59e0b'] },
  { mode: 'custom', label: 'Custom', description: 'Your own color scheme', previewColors: ['var(--color-void-base)', 'var(--color-purple-500)', 'var(--color-gold-400)'] },
];

export const DENSITY_OPTIONS: SegmentOption<DensityMode>[] = [
  { value: 'spacious', label: 'Spacious' },
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'dense', label: 'Dense' },
];

export const ATMOSPHERE_OPTIONS: SegmentOption<AtmosphereMode>[] = [
  { value: 'full', label: 'Full' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'None' },
];
