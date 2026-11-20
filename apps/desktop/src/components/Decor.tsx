/**
 * PRIVIA's two decorative elements, drawn as SVG so they stay sharp at any
 * size and cost no network request: red light ribbons in the top-left corner
 * of the window, and the glowing ring beside the greeting on Home.
 *
 * Both are aria-hidden and pointer-events-none: pure atmosphere, never content.
 */

import { useId } from 'react';

export function Beams({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden
      viewBox="0 0 900 600"
      preserveAspectRatio="xMinYMin slice"
      className={`pointer-events-none select-none ${className}`}
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d4494f" stopOpacity="0.85" />
          <stop offset="0.4" stopColor="#8c2a2f" stopOpacity="0.5" />
          <stop offset="1" stopColor="#08090B" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0575c" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#7a262a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#08090B" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a8e" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#a83236" stopOpacity="0.12" />
          <stop offset="1" stopColor="#08090B" stopOpacity="0" />
        </linearGradient>
        <radialGradient
          id={`${id}-fade`}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="matrix(760 0 0 560 0 0)"
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.65" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="900" height="600" fill={`url(#${id}-fade)`} />
        </mask>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={`${id}-edge`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <g mask={`url(#${id}-mask)`}>
        {/* A broad wedge of red light from the corner */}
        <polygon points="0,0 300,0 0,360" fill={`url(#${id}-a)`} filter={`url(#${id}-soft)`} />
        {/* Two folded ribbons */}
        <polygon
          points="330,0 470,0 0,600 0,430"
          fill={`url(#${id}-b)`}
          filter={`url(#${id}-soft)`}
        />
        <polygon
          points="520,0 560,0 0,720 0,660"
          fill={`url(#${id}-b)`}
          opacity="0.6"
          filter={`url(#${id}-soft)`}
        />
        {/* Thin bright edges, like light catching a fold */}
        <line
          x1="470"
          y1="0"
          x2="0"
          y2="600"
          stroke={`url(#${id}-c)`}
          strokeWidth="2.5"
          filter={`url(#${id}-edge)`}
        />
        <line
          x1="300"
          y1="0"
          x2="0"
          y2="360"
          stroke={`url(#${id}-c)`}
          strokeWidth="1.5"
          opacity="0.8"
          filter={`url(#${id}-edge)`}
        />
      </g>
    </svg>
  );
}

export function Halo({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden
      viewBox="0 0 340 260"
      className={`pointer-events-none select-none ${className}`}
    >
      <defs>
        <linearGradient id={`${id}-ring`} x1="0.1" y1="0.1" x2="0.9" y2="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="0.8" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g transform="rotate(26 170 130)">
        {/* Soft glow, then a crisp line on top */}
        <ellipse
          cx="170"
          cy="130"
          rx="128"
          ry="74"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="12"
          filter={`url(#${id}-glow)`}
          opacity="0.7"
        />
        <ellipse
          cx="170"
          cy="130"
          rx="128"
          ry="74"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="3"
        />
        <ellipse
          cx="170"
          cy="130"
          rx="116"
          ry="64"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="1"
          opacity="0.35"
        />
      </g>
    </svg>
  );
}

/** The PRIVIA wordmark: a red slash, then the name. */
export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-label="PRIVIA">
      <svg aria-hidden viewBox="0 0 14 26" className="h-6 w-3.5 shrink-0">
        <defs>
          <linearGradient id="privia-slash" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#8f2a2e" />
            <stop offset="1" stopColor="#e0575c" />
          </linearGradient>
        </defs>
        <polygon points="9,0 14,0 5,26 0,26" fill="url(#privia-slash)" />
      </svg>
      {!collapsed ? (
        <span className="text-[1.05rem] font-semibold tracking-[0.3em] text-graphite-100">
          PRIVIA
        </span>
      ) : null}
    </span>
  );
}
