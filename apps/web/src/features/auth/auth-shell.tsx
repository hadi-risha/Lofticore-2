import type { ReactNode } from "react";

// A small drawn living room in the brand colours, so the sign-in pages need no photo
// (nothing to download, and it stays sharp at any size).
function RoomArt() {
  return (
    <svg
      viewBox="0 0 640 680"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a7168" />
          <stop offset="1" stopColor="#36463f" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#e3b873" stopOpacity="0.45" />
          <stop offset="1" stopColor="#e3b873" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="680" fill="url(#wall)" />

      {/* arched window */}
      <path
        d="M170 500 V230 A150 150 0 0 1 470 230 V500 Z"
        fill="#fffcf6"
        fillOpacity="0.07"
        stroke="#e3b873"
        strokeOpacity="0.4"
        strokeWidth="2"
      />
      <path d="M320 80 V500 M170 290 H470" stroke="#e3b873" strokeOpacity="0.25" strokeWidth="2" />

      {/* floor and rug */}
      <rect y="500" width="640" height="180" fill="#2d3a34" />
      <ellipse cx="320" cy="545" rx="230" ry="28" fill="#e3b873" fillOpacity="0.16" />

      {/* floor lamp */}
      <circle cx="548" cy="250" r="150" fill="url(#glow)" />
      <ellipse cx="548" cy="503" rx="34" ry="7" fill="#000" fillOpacity="0.25" />
      <path d="M548 503 V260" stroke="#f6ecd8" strokeWidth="6" strokeLinecap="round" />
      <path d="M500 262 L596 262 L574 192 L522 192 Z" fill="#f6ecd8" />

      {/* plant */}
      <ellipse cx="92" cy="505" rx="42" ry="7" fill="#000" fillOpacity="0.25" />
      <path d="M62 505 L122 505 L113 448 L71 448 Z" fill="#745f3d" />
      <ellipse cx="80" cy="402" rx="15" ry="50" transform="rotate(-28 80 448)" fill="#8aa294" />
      <ellipse cx="94" cy="386" rx="15" ry="58" fill="#a3b8ab" />
      <ellipse cx="110" cy="404" rx="15" ry="48" transform="rotate(28 110 448)" fill="#8aa294" />

      {/* armchair */}
      <ellipse cx="320" cy="512" rx="150" ry="9" fill="#000" fillOpacity="0.28" />
      <path
        d="M232 462 L224 508 M408 462 L416 508"
        stroke="#745f3d"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <rect x="226" y="296" width="188" height="170" rx="64" fill="#e3b873" />
      <rect x="196" y="372" width="54" height="100" rx="26" fill="#c99a55" />
      <rect x="390" y="372" width="54" height="100" rx="26" fill="#c99a55" />
      <rect x="214" y="408" width="212" height="62" rx="26" fill="#ecd09b" />
      <rect x="262" y="336" width="116" height="74" rx="28" fill="#f6ecd8" />
    </svg>
  );
}

// Shared frame for every sign-in style page: form on the left, an illustration on larger screens.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-line bg-white shadow-sm lg:grid-cols-2">
        <div className="p-6 sm:p-10">
          <h1 className="text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <div className="relative hidden lg:block">
          <RoomArt />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/70 via-transparent to-transparent" />
          <p className="absolute bottom-8 left-8 right-8 font-display text-2xl leading-snug text-white">
            Pieces with a point of view, from makers who care.
          </p>
        </div>
      </div>
    </div>
  );
}
