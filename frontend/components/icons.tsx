/**
 * Icon set.
 *
 * Inline SVG rather than an icon package: there are twelve of them, they all
 * inherit `currentColor`, and shipping a dependency for twelve paths would
 * cost more bundle than the entire rest of this UI.
 *
 * Every icon is drawn on a 24x24 grid with a 1.75 stroke so weights match
 * when they sit next to each other in a row.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number | undefined) {
  const s = size ?? 16;
  return {
    width: s,
    height: s,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false as const,
  };
}

export function ShieldIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.9-7 9.5-4.1-1.6-7-5.3-7-9.5V6l7-3z" />
    </svg>
  );
}

export function ShieldCheckIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.9-7 9.5-4.1-1.6-7-5.3-7-9.5V6l7-3z" />
      <path d="M9.2 12.1l1.9 1.9 3.7-3.9" />
    </svg>
  );
}

export function LockIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 017.6 0v2.7" />
    </svg>
  );
}

export function WalletIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.8 8.4A2.4 2.4 0 016.2 6h10.4a2.2 2.2 0 012.2 2.2v.4" />
      <rect x="3.8" y="8.4" width="16.4" height="10.6" rx="2.4" />
      <path d="M16.6 13.7h.01" />
    </svg>
  );
}

export function EyeIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

export function VaultIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <circle cx="11" cy="12" r="3.4" />
      <path d="M11 8.6v-1M11 16.4v1M17.4 9.5v5" />
    </svg>
  );
}

export function DownloadIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4v10" />
      <path d="M8.2 10.4L12 14.2l3.8-3.8" />
      <path d="M4.8 17.2v.9a2 2 0 002 2h10.4a2 2 0 002-2v-.9" />
    </svg>
  );
}

export function PauseIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="8.4" y="6.2" width="2.6" height="11.6" rx="1.1" />
      <rect x="13" y="6.2" width="2.6" height="11.6" rx="1.1" />
    </svg>
  );
}

export function PenIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15.6 4.9l3.5 3.5" />
      <path d="M5 19l.9-3.6L16.2 5.1a1.6 1.6 0 012.3 0l.4.4a1.6 1.6 0 010 2.3L8.6 18.1 5 19z" />
    </svg>
  );
}

export function ArrowRightIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.6 12h14" />
      <path d="M13.4 6.8L18.6 12l-5.2 5.2" />
    </svg>
  );
}

export function CheckIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12.6l4.4 4.4L19 7.4" />
    </svg>
  );
}

export function AlertIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.9v4.6M12 16.1h.01" />
    </svg>
  );
}

export function InfoIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 16.1v-4.6M12 7.9h.01" />
    </svg>
  );
}

export function PulseIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12h3.6l2.2-5.6 3.6 11.2 2.3-5.6H21" />
    </svg>
  );
}

export function SwapIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.6 8.4h13" />
      <path d="M14.2 5.2l3.4 3.2-3.4 3.2" />
      <path d="M19.4 15.6h-13" />
      <path d="M9.8 12.4l-3.4 3.2 3.4 3.2" />
    </svg>
  );
}

export function CrossIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
