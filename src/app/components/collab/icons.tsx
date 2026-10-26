// Collab icons in TradingView's style: thin 1px strokes on a 28px (toolbar) or 18px (inline) grid

type P = { size?: number };

// Two people: the right-toolbar button and the chart menu's "Collaborate…"
export const CollabIcon = ({ size = 28 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor">
    <circle cx="11" cy="10" r="3.5" />
    <path d="M4.5 21.5c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    <path d="M17 6.8a3.5 3.5 0 0 1 0 6.4M19.5 16.3c2.1.7 3.6 2.4 4 5.2" />
  </svg>
);

export const CloseIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size}><path stroke="currentColor" strokeWidth="1.2" d="m1.5 1.5 15 15m0-15-15 15" /></svg>
);

export const LinkIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <path d="M7.5 10.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2L9 4.8" />
    <path d="M10.5 7.5a3 3 0 0 0-4.2 0L3.7 10.1a3 3 0 0 0 4.2 4.2L9 13.2" />
  </svg>
);

export const GlobeIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <circle cx="9" cy="9" r="6.5" /><path d="M2.5 9h13M9 2.5c2 2 2.8 4.2 2.8 6.5S11 13.5 9 15.5M9 2.5C7 4.5 6.2 6.7 6.2 9S7 13.5 9 15.5" />
  </svg>
);

export const LockIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <rect x="4.5" y="8" width="9" height="7" rx="1.5" /><path d="M6.5 8V6a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const MicIcon = ({ size = 18, off = false }: P & { off?: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <rect x="6.5" y="2.5" width="5" height="8.5" rx="2.5" />
    <path d="M4 9a5 5 0 0 0 10 0M9 14v2.5M6.5 16.5h5" />
    {off && <path d="m3 3 12 12" />}
  </svg>
);

export const PhoneIcon = ({ size = 18, hangup = false }: P & { hangup?: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor" style={hangup ? { transform: "rotate(135deg)" } : undefined}>
    <path d="M5.2 2.5 7 6.2 5.6 7.6a9 9 0 0 0 4.8 4.8L11.8 11l3.7 1.8-.6 2.4c-.2.6-.8 1-1.4.9C7.8 15.6 2.4 10.2 1.9 4.5c0-.6.3-1.2.9-1.4l2.4-.6Z" />
  </svg>
);

export const SendIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <path d="M2.5 9 15.5 3l-4 12.5-2.6-5.4L2.5 9ZM8.9 10.1 15.5 3" />
  </svg>
);

export const AddPersonIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <circle cx="7.5" cy="6" r="3" /><path d="M2 15.5c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5M14 6v5M11.5 8.5h5" />
  </svg>
);

export const LeaveIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <path d="M10.5 3.5h-6v11h6M8 9h8M13.5 6.5 16 9l-2.5 2.5" />
  </svg>
);

export const CopyIcon = ({ size = 18 }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size} height={size} fill="none" stroke="currentColor">
    <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" /><path d="M11.5 6.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </svg>
);
