// 內嵌 SVG 圖示（沿用 article2speech 線條質感，零相依）。
type P = { size?: number };
const svg = (size: number, path: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

export const PlayIcon = ({ size = 18 }: P) =>
  svg(size, <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />);
export const PauseIcon = ({ size = 18 }: P) =>
  svg(
    size,
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>,
  );
export const PrevIcon = ({ size = 18 }: P) => svg(size, <polyline points="15 5 8 12 15 19" />);
export const NextIcon = ({ size = 18 }: P) => svg(size, <polyline points="9 5 16 12 9 19" />);
export const RepeatIcon = ({ size = 18 }: P) =>
  svg(
    size,
    <>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>,
  );
export const HeadphonesIcon = ({ size = 18 }: P) =>
  svg(
    size,
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>,
  );
export const TranslateIcon = ({ size = 16 }: P) =>
  svg(
    size,
    <>
      <path d="M4 5h7M9 3v2c0 4-2 7-5 8" />
      <path d="M5 9c0 2 2 4 6 5" />
      <path d="M13 21l4-9 4 9M14.5 18h5" />
    </>,
  );
export const ShareIcon = ({ size = 16 }: P) =>
  svg(
    size,
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </>,
  );
export const GearIcon = ({ size = 15 }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
  );
export const ImageIcon = ({ size = 15 }: P) =>
  svg(
    size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M21 15.5l-4.5-4.5L8 19.5" />
    </>,
  );
export const SoundIcon = ({ size = 15 }: P) =>
  svg(
    size,
    <>
      <polygon points="4 9 8 9 13 5 13 19 8 15 4 15 4 9" fill="currentColor" stroke="none" />
      <path d="M16 9a3 3 0 0 1 0 6" />
    </>,
  );
