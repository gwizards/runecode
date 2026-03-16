interface RuneCodeLogoProps {
  size?: number;
  className?: string;
}

/**
 * RuneCode logo — layered diamond with terminal rune (>_) at center.
 */
export function RuneCodeLogo({ size = 32, className = '' }: RuneCodeLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      {/* Outer diamond */}
      <path d="M64 6 L122 64 L64 122 L6 64 Z" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.2"/>
      {/* Middle diamond */}
      <path d="M64 20 L108 64 L64 108 L20 64 Z" stroke="currentColor" strokeWidth="1" fill="var(--color-void-base, transparent)" opacity="0.5"/>
      {/* Inner diamond */}
      <path d="M64 36 L92 64 L64 92 L36 64 Z" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
      {/* Terminal cursor > */}
      <path d="M42 44 L62 64 L42 84" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Underscore _ */}
      <path d="M68 78 L88 78" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
      {/* Energy line above */}
      <path d="M64 36 L64 42" stroke="currentColor" strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      {/* Energy rays */}
      <path d="M64 6 L64 20" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <path d="M122 64 L108 64" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <path d="M64 108 L64 122" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      <path d="M20 64 L6 64" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      {/* Corner dots */}
      <circle cx="64" cy="6" r="2" fill="currentColor" opacity="0.5"/>
      <circle cx="122" cy="64" r="2" fill="currentColor" opacity="0.5"/>
      <circle cx="64" cy="122" r="2" fill="currentColor" opacity="0.5"/>
      <circle cx="6" cy="64" r="2" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}

interface RuneSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Animated RuneCode loading spinner — rotating diamond with pulsing terminal rune.
 * Replaces all generic Loader2 and rotating-symbol spinners.
 */
export function RuneSpinner({ size = 24, className = '', label }: RuneSpinnerProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        width={size}
        height={size}
      >
        {/* Rotating outer diamond */}
        <path
          d="M24 2 L46 24 L24 46 L2 24 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          opacity="0.3"
          className="rune-spinner-ring"
        />
        {/* Static inner diamond */}
        <path
          d="M24 10 L38 24 L24 38 L10 24 Z"
          stroke="currentColor"
          strokeWidth="0.75"
          fill="none"
          opacity="0.2"
        />
        {/* Terminal > symbol */}
        <path
          d="M16 16 L24 24 L16 32"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className="rune-spinner-bolt"
        />
        {/* Underscore _ */}
        <path
          d="M26 30 L34 30"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="rune-spinner-bolt"
        />
        {/* Orbiting corner dot */}
        <circle r="1.5" fill="currentColor">
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            path="M24,2 L46,24 L24,46 L2,24 Z"
          />
        </circle>
      </svg>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

/**
 * Inline rotating rune symbol — replaces the CSS .rotating-symbol class.
 * Use as a drop-in replacement for <div className="rotating-symbol" />.
 */
export function RotatingRune({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`inline-block align-middle ${className}`}
    >
      {/* Rotating diamond outline */}
      <path
        d="M16 2 L30 16 L16 30 L2 16 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
        className="rune-spinner-ring"
      />
      {/* Terminal > */}
      <path
        d="M10 10 L16 16 L10 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="rune-spinner-bolt"
      />
      {/* _ */}
      <path
        d="M18 20 L24 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
