import React, { useState, useRef, useCallback } from 'react';
import {
  useTheme,
  type ThemeMode,
  type DensityMode,
  type AtmosphereMode,
  type CustomThemeColors,
} from '@/contexts/ThemeContext';

// ===== Local SegmentedControl =====

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
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
              color: isActive
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              background: isActive
                ? 'var(--color-purple-500)'
                : 'transparent',
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

// ===== Theme Card =====

interface ThemeCardProps {
  mode: ThemeMode;
  label: string;
  description: string;
  previewColors: [string, string, string];
  isActive: boolean;
  onClick: () => void;
}

function ThemeCard({
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
        boxShadow: isActive
          ? '0 0 16px oklch(0.62 0.28 292 / 0.3)'
          : 'none',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        minWidth: 0,
      }}
    >
      {/* Color preview strip */}
      <div style={{ display: 'flex', gap: 4, height: 24 }}>
        {previewColors.map((color, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 4,
              background: color,
            }}
          />
        ))}
      </div>
      <span
        className="text-label"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {label}
      </span>
      <span
        className="text-caption"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {description}
      </span>
    </button>
  );
}

// ===== Color Group =====

interface ColorGroupProps {
  title: string;
  colors: { key: keyof CustomThemeColors; label: string }[];
  customColors: CustomThemeColors;
  onColorChange: (key: keyof CustomThemeColors, value: string) => void;
}

function ColorGroup({ title, colors, customColors, onColorChange }: ColorGroupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 14px',
          background: 'var(--color-void-raised)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-primary)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span
          style={{
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}
        >
          ▶
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 14,
            background: 'var(--color-void-deep)',
          }}
        >
          {colors.map(({ key, label }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <input
                type="color"
                value={oklchToHexFallback(customColors[key])}
                onChange={(e) => onColorChange(key, e.target.value)}
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 6,
                  padding: 0,
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="text-caption"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {label}
                </div>
                <div
                  className="text-caption"
                  style={{
                    color: 'var(--color-text-muted)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
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

// Simple fallback: render the oklch value via a canvas to get hex
// For the color picker input, we need a hex value
function oklchToHexFallback(oklchValue: string): string {
  // If it's already a hex value, return it
  if (oklchValue.startsWith('#')) return oklchValue;
  // Default fallback — the color picker will show a reasonable default
  // The actual color is applied via CSS custom properties, this is just for the picker UI
  return '#6b21a8';
}

// ===== Color group definitions =====

const COLOR_GROUPS: { title: string; colors: { key: keyof CustomThemeColors; label: string }[] }[] = [
  {
    title: 'Backgrounds',
    colors: [
      { key: 'voidDeep', label: 'Void Deep' },
      { key: 'voidBase', label: 'Void Base' },
      { key: 'voidRaised', label: 'Void Raised' },
      { key: 'voidElevated', label: 'Void Elevated' },
      { key: 'voidOverlay', label: 'Void Overlay' },
    ],
  },
  {
    title: 'Primary',
    colors: [
      { key: 'purple400', label: 'Purple 400' },
      { key: 'purple500', label: 'Purple 500' },
      { key: 'purple600', label: 'Purple 600' },
    ],
  },
  {
    title: 'Accent',
    colors: [
      { key: 'gold300', label: 'Gold 300' },
      { key: 'gold400', label: 'Gold 400' },
      { key: 'gold500', label: 'Gold 500' },
    ],
  },
  {
    title: 'Text',
    colors: [
      { key: 'textPrimary', label: 'Text Primary' },
      { key: 'textSecondary', label: 'Text Secondary' },
      { key: 'textMuted', label: 'Text Muted' },
    ],
  },
  {
    title: 'Semantic',
    colors: [
      { key: 'borderSubtle', label: 'Border Subtle' },
    ],
  },
];

// ===== Theme definitions =====

const THEME_OPTIONS: {
  mode: ThemeMode;
  label: string;
  description: string;
  previewColors: [string, string, string];
}[] = [
  {
    mode: 'void-protocol',
    label: 'Void Protocol',
    description: 'Deep dark with purple accents',
    previewColors: ['oklch(0.06 0.02 285)', 'oklch(0.62 0.28 292)', 'oklch(0.78 0.15 80)'],
  },
  {
    mode: 'daylight',
    label: 'Daylight',
    description: 'Clean light theme for bright environments',
    previewColors: ['#f8f9fa', '#6b21a8', '#d4a574'],
  },
  {
    mode: 'slate',
    label: 'Slate',
    description: 'Neutral mid-tone gray palette',
    previewColors: ['#1e293b', '#7c3aed', '#f59e0b'],
  },
  {
    mode: 'custom',
    label: 'Custom',
    description: 'Your own color scheme',
    previewColors: ['var(--color-void-base)', 'var(--color-purple-500)', 'var(--color-gold-400)'],
  },
];

const DENSITY_OPTIONS: SegmentOption<DensityMode>[] = [
  { value: 'spacious', label: 'Spacious' },
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'dense', label: 'Dense' },
];

const ATMOSPHERE_OPTIONS: SegmentOption<AtmosphereMode>[] = [
  { value: 'full', label: 'Full' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none', label: 'None' },
];

// ===== Main Component =====

export function AppearanceSettings() {
  const {
    theme,
    density,
    atmosphere,
    customColors,
    setTheme,
    setDensity,
    setAtmosphere,
    setCustomColors,
  } = useTheme();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleColorChange = useCallback(
    (key: keyof CustomThemeColors, value: string) => {
      setCustomColors({ [key]: value });
    },
    [setCustomColors]
  );

  const handleExport = useCallback(() => {
    const json = JSON.stringify(customColors, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'runecode-theme.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [customColors]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          setCustomColors(parsed);
        } catch {
          console.error('Invalid theme file');
        }
      };
      reader.readAsText(file);

      // Reset so same file can be re-imported
      e.target.value = '';
    },
    [setCustomColors]
  );

  const handleReset = useCallback(() => {
    setCustomColors({
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
    });
  }, [setCustomColors]);

  const actionButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-void-raised)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'background 0.15s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Theme Selector */}
      <section>
        <h3
          className="text-heading-3"
          style={{
            color: 'var(--color-text-primary)',
            marginBottom: 12,
          }}
        >
          Theme
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          {THEME_OPTIONS.map((opt) => (
            <ThemeCard
              key={opt.mode}
              mode={opt.mode}
              label={opt.label}
              description={opt.description}
              previewColors={opt.previewColors}
              isActive={theme === opt.mode}
              onClick={() => setTheme(opt.mode)}
            />
          ))}
        </div>
      </section>

      {/* Density Control */}
      <section>
        <h3
          className="text-heading-3"
          style={{
            color: 'var(--color-text-primary)',
            marginBottom: 12,
          }}
        >
          Density
        </h3>
        <SegmentedControl
          options={DENSITY_OPTIONS}
          value={density}
          onChange={setDensity}
        />
      </section>

      {/* Atmosphere Control */}
      <section>
        <h3
          className="text-heading-3"
          style={{
            color: 'var(--color-text-primary)',
            marginBottom: 12,
          }}
        >
          Atmosphere
        </h3>
        <SegmentedControl
          options={ATMOSPHERE_OPTIONS}
          value={atmosphere}
          onChange={setAtmosphere}
        />
        <p
          className="text-caption"
          style={{
            color: 'var(--color-text-muted)',
            marginTop: 8,
          }}
        >
          Automatically set to None when your system requests reduced motion.
        </p>
      </section>

      {/* Custom Theme Editor */}
      {theme === 'custom' && (
        <section>
          <h3
            className="text-heading-3"
            style={{
              color: 'var(--color-text-primary)',
              marginBottom: 12,
            }}
          >
            Custom Theme Editor
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {COLOR_GROUPS.map((group) => (
              <ColorGroup
                key={group.title}
                title={group.title}
                colors={group.colors}
                customColors={customColors}
                onColorChange={handleColorChange}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <button onClick={handleExport} style={actionButtonStyle}>
              Export JSON
            </button>
            <button onClick={handleImport} style={actionButtonStyle}>
              Import Theme
            </button>
            <button
              onClick={handleReset}
              style={{
                ...actionButtonStyle,
                borderColor: 'var(--color-purple-500)',
                color: 'var(--color-purple-400)',
              }}
            >
              Reset
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
