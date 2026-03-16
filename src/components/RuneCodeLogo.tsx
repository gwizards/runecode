interface RuneCodeLogoProps {
  size?: number;
  className?: string;
}

/**
 * Static RuneCode logo — stylized R with lightning rune mark.
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
      <rect width="128" height="128" rx="28" fill="#1a1625"/>
      <circle cx="64" cy="64" r="48" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.3"/>
      <circle cx="64" cy="64" r="38" stroke="#a78bfa" strokeWidth="0.75" opacity="0.15"/>
      <path d="M48 30 L48 98" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round"/>
      <path d="M48 30 Q48 30 50 28 Q58 22 72 26 Q82 30 82 42 Q82 54 72 58 Q64 61 48 58"
            stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M60 58 L72 74 L64 74 L80 98"
            stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="88" cy="36" r="2.5" fill="#c4b5fd" opacity="0.6"/>
      <circle cx="42" cy="20" r="2" fill="#c4b5fd" opacity="0.4"/>
      <circle cx="86" cy="92" r="2" fill="#c4b5fd" opacity="0.5"/>
    </svg>
  );
}

interface RuneSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Animated RuneCode loading spinner — glowing rune circle with orbiting accent.
 * Use this instead of generic Loader2 spinners throughout the app.
 */
export function RuneSpinner({ size = 24, className = '', label }: RuneSpinnerProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="rune-spinner"
      >
        {/* Outer rotating ring */}
        <circle
          cx="24" cy="24" r="20"
          stroke="#8b5cf6"
          strokeWidth="2"
          fill="none"
          opacity="0.2"
        />
        <circle
          cx="24" cy="24" r="20"
          stroke="url(#runeGrad)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="31.4 94.2"
          className="rune-spinner-ring"
        />

        {/* Inner rune mark (static lightning bolt) */}
        <path
          d="M24 10 L19 24 h4 L18 38"
          stroke="#a78bfa"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className="rune-spinner-bolt"
        />

        {/* Orbiting accent dot */}
        <circle r="2" fill="#c4b5fd" className="rune-spinner-dot">
          <animateMotion
            dur="1.5s"
            repeatCount="indefinite"
            path="M24,4 A20,20 0 1,1 23.99,4"
          />
        </circle>

        <defs>
          <linearGradient id="runeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6"/>
            <stop offset="50%" stopColor="#a78bfa"/>
            <stop offset="100%" stopColor="#7c3aed"/>
          </linearGradient>
        </defs>
      </svg>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
