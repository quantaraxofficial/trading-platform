"use client";

// TradingView's own icons from the strategy report (paths as TradingView draws them)

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

export const StMetricsIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="m16.001 7.05-4.81 4.887-4.308-3.835-3.81 3.899L2 10.95l4.81-4.92 4.312 3.838 3.81-3.87z" /></svg>
);
export const StTradesIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M14.653 3.008A1.5 1.5 0 0 1 16 4.5v10l-.008.153a1.5 1.5 0 0 1-1.339 1.34L14.5 16h-11a1.5 1.5 0 0 1-1.492-1.347L2 14.5v-10A1.5 1.5 0 0 1 3.5 3h11zM3 14.5a.5.5 0 0 0 .5.5H6v-3H3zm4 .5h7.5a.5.5 0 0 0 .5-.5V12H7zm-4-4h3V8H3zm4 0h8V8H7zM3.5 4a.5.5 0 0 0-.5.5V7h3V4zM7 7h8V4.5a.5.5 0 0 0-.5-.5H7z" /></svg>
);
export const StCalendarIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} aria-hidden {...p}><path fill="currentColor" d="M10 6h8V4h1v2h1.5A2.5 2.5 0 0 1 23 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 5 19.5v-11A2.5 2.5 0 0 1 7.5 6H9V4h1zM6 19.5A1.5 1.5 0 0 0 7.5 21h13a1.5 1.5 0 0 0 1.5-1.5V11H6zM7.5 7A1.5 1.5 0 0 0 6 8.5V10h16V8.5A1.5 1.5 0 0 0 20.5 7H19v1h-1V7h-8v1H9V7z" /></svg>
);
export const StChevronDown18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z" /></svg>
);
export const StDetalizationIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} aria-hidden {...p}><path fill="currentColor" d="M14 5h5v3h-1V6H9v16h10v1h-5v3h-1v-3H8V5h5V2h1zm4 5a5 5 0 0 1 3.871 8.164l3.126 3.126-.708.707-3.125-3.125A5 5 0 1 1 18 10m0 1a4 4 0 1 0 0 8 4 4 0 0 0 0-8" /></svg>
);
export const StScriptExecIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} aria-hidden {...p}><path fill="currentColor" d="m20.354 21.647-.707.707L18 20.707V25h-1v-4.293l-1.646 1.646-.707-.707 2.853-2.853zm3.648-10.953-4.656 4.818a2.5 2.5 0 0 1-3.596 0l-3.218-3.33a1.5 1.5 0 0 0-2.157 0L5.719 17 5 16.306l4.656-4.819a2.5 2.5 0 0 1 3.596 0l3.218 3.33a1.5 1.5 0 0 0 2.157 0L23.282 10zM11 7.293l1.646-1.647.707.708L10.5 9.207 7.646 6.354l.708-.708L10 7.293V3h1z" /></svg>
);
export const StGear28Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} fill="currentColor" aria-hidden {...p}><path fillRule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path fillRule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z" /></svg>
);
export const StAddAlertIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} aria-hidden {...p}><path fill="currentColor" d="m19.54 4.5 3.96 4.32-.74.68-3.96-4.32.74-.68ZM7.46 4.5 3.5 8.82l.74.68L8.2 5.18l-.74-.68ZM19.74 10.33A7.5 7.5 0 0 1 21 14.5v.5h1v-.5a8.5 8.5 0 1 0-8.5 8.5h.5v-1h-.5a7.5 7.5 0 1 1 6.24-11.67Z" /><path fill="currentColor" d="M13 9v5h-3v1h4V9h-1ZM19 20v-4h1v4h4v1h-4v4h-1v-4h-4v-1h4Z" /></svg>
);
export const StDownloadIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ? (size * 28) / 28 : 28} aria-hidden {...p}><path fill="currentColor" d="M7 17v4.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5V17h1v4.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 6 21.5V17zm8-11v11.293l3.146-3.146.707.707-4.353 4.353-4.353-4.353.707-.707L14 17.293V6z" /></svg>
);
export const StColumnsIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="m4 4h-2v10h2zm-2-1c-.55228 0-1 .44772-1 1v10c0 .5523.44772 1 1 1h2c.55228 0 1-.4477 1-1v-10c0-.55228-.44772-1-1-1zm8 1h-2v10h2zm-2-1c-.55228 0-1 .44772-1 1v10c0 .5523.44772 1 1 1h2c.5523 0 1-.4477 1-1v-10c0-.55228-.4477-1-1-1zm6 1h2v10h-2zm-1 0c0-.55228.4477-1 1-1h2c.5523 0 1 .44772 1 1v10c0 .5523-.4477 1-1 1h-2c-.5523 0-1-.4477-1-1z" /></svg>
);
export const StTargetIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" fillRule="evenodd" d="M3.58 9.5a5.45 5.45 0 0 0 4.92 4.92V16h1v-1.58a5.45 5.45 0 0 0 4.92-4.92H16v-1h-1.58A5.45 5.45 0 0 0 9.5 3.58V2h-1v1.58A5.45 5.45 0 0 0 3.58 8.5H2v1h1.58ZM8.5 6V4.58A4.45 4.45 0 0 0 4.58 8.5H6v1H4.58a4.45 4.45 0 0 0 3.92 3.92V12h1v1.42a4.45 4.45 0 0 0 3.92-3.92H12v-1h1.42A4.45 4.45 0 0 0 9.5 4.58V6h-1Z" /></svg>
);
export const StClose18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M13.35 5.35a.5.5 0 0 0-.7-.7L9 8.29 5.35 4.65a.5.5 0 1 0-.7.7L8.29 9l-3.64 3.65a.5.5 0 0 0 .7.7L9 9.71l3.65 3.64a.5.5 0 0 0 .7-.7L9.71 9l3.64-3.65z" /></svg>
);
export const StCheckMarkIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 11 9" width={size ?? 11} height={size ? (size * 9) / 11 : 9} aria-hidden {...p}><path stroke="currentColor" strokeWidth="2" d="M0.999878 4L3.99988 7L9.99988 1" /></svg>
);
export const StHelp18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" fillRule="evenodd" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm-1-4a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm2.83-3.52c-.49.43-.97.85-1.06 1.52H8.26c.08-1.18.74-1.69 1.32-2.13.49-.38.92-.71.92-1.37C10.5 6.67 9.82 6 9 6s-1.5.67-1.5 1.5V8H6v-.5a3 3 0 1 1 6 0c0 .96-.6 1.48-1.17 1.98Z" /></svg>
);
export const StInfo18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm1-12a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM8.5 9.5H7V8h3v6H8.5V9.5Z" /></svg>
);
export const StChevronUp18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M3.92 10.17 9 5.71l5.08 4.46-1 1.13L9 7.71 4.91 11.3l-.99-1.13Z" /></svg>
);
export const StGear18Icon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" fillRule="evenodd" d="M12 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /><path fill="currentColor" fillRule="evenodd" d="M4.73 2h8.54L17 9l-3.73 7H4.73L1 9l3.73-7Zm-2.6 7 3.2-6h7.34l3.2 6-3.2 6H5.33l-3.2-6Z" /></svg>
);
export const StCameraIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M10.586 3a1 1 0 0 1 .707.293L12 4h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2l.708-.707A1 1 0 0 1 7.415 3zM6.415 5H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.414l-1-1H7.415zM9 6.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6m0 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4" /></svg>
);
export const StExpandIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M3 15h5v1H2v-6h1zm13-7h-1V3h-5V2h6z" /></svg>
);
export const StEyeOffIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M3.7 15 15 3.7l-.7-.7L3 14.3l.7.7ZM9 3c1.09 0 2.17.23 3.19.7l-.77.76C10.63 4.16 9.82 4 9 4 6.31 4 3.58 5.63 2.08 9a9.35 9.35 0 0 0 1.93 2.87l-.7.7A10.44 10.44 0 0 1 1.08 9.2L1 9l.08-.2C2.69 4.99 5.82 3 9 3Z" /><path fill="currentColor" d="M9 6a3 3 0 0 1 .78.1l-.9.9A2 2 0 0 0 7 8.88l-.9.9A3 3 0 0 1 9 6ZM11.9 8.22l-.9.9A2 2 0 0 1 9.13 11l-.9.9a3 3 0 0 0 3.67-3.68Z" /><path fill="currentColor" d="M9 14c-.82 0-1.64-.15-2.43-.45l-.76.76c1.02.46 2.1.7 3.19.7 3.18 0 6.31-1.98 7.92-5.81L17 9l-.08-.2a10.44 10.44 0 0 0-2.23-3.37l-.7.7c.75.76 1.41 1.71 1.93 2.87-1.5 3.37-4.23 5-6.92 5Z" /></svg>
);
export const StTogglerChevronIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" width={size ?? 15} height={size ? (size * 15) / 15 : 15} aria-hidden {...p}><path fill="currentColor" d="M3.5 5.58c.24-.28.65-.3.92-.07L7.5 8.14l3.08-2.63a.65.65 0 1 1 .84.98L7.5 9.86 3.58 6.49a.65.65 0 0 1-.07-.91z" /></svg>
);
export const StLockIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M9 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4M5 8a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1zm4 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1m0-7a3 3 0 0 0-3 3v1h6V6a3 3 0 0 0-3-3" /></svg>
);
export const StDashLineIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 12 18" width={size ?? 12} height={size ? (size * 18) / 12 : 18} aria-hidden {...p}><line stroke="currentColor" strokeDasharray="3 1.5" strokeWidth="2" x1="0" x2="12" y1="10" y2="10" /></svg>
);
export const StArrowUpRightIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M13 10h-1V6.707l-5.646 5.647-.708-.707L11.293 6H8V5h5z" /></svg>
);
export const StArrowDownRightIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={size ?? 18} height={size ? (size * 18) / 18 : 18} aria-hidden {...p}><path fill="currentColor" d="M12 11.293V8h1v5H8v-1h3.293L5.646 6.354l.708-.708z" /></svg>
);
export const StUfoIcon = (p: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width={72} height={72} aria-hidden {...p}><path fill="currentColor" d="M36.54 4.01c3.78.17 6.98 2.2 8.5 5.07C51.54 10.73 56 14.11 56 18.01v.26c-.16 2.93-2.83 5.54-6.98 7.32L69 68h-2.2L47.13 26.3A36 36 0 0 1 36 28a35 35 0 0 1-11.96-1.98L5.2 68h-2.2l19.2-42.76c-3.7-1.76-6.04-4.23-6.18-6.97L16 18c0-3.9 4.46-7.28 10.97-8.93 1.6-3 5.06-5.08 9.06-5.08zM41.1 34c.28 0 .6 1.24.55 2.5a4 4 0 0 1 3.03.85l.53.42.53.04A3.53 3.53 0 0 1 49 41.34v.25a3.5 3.5 0 0 1-2.14 3.01l-2.04.86v.04a18 18 0 0 1-1.9 6.56l1.84 5.4L39.4 60l-3.27-3.88-2.48 1.27a13 13 0 0 1-.53 1.7l.88 3.18L28.24 65l-7.27-13.22a2 2 0 0 0-.63 2.41l2.22 5-1.83.81-2.22-5a4 4 0 0 1 1.79-5.16c.07-.61.45-1.17 1.04-1.46l14.2-6.78L34 38.57l3.6-.45a7.6 7.6 0 0 0 3.29-3.8q.09-.33.21-.32m2.33 4.91a2 2 0 0 0-2.29-.15l-1.77 1.07-.18.1-.2.03-1.92.24.7 1.4.47.92-.92.44-14.98 7.16 6.74 12.29 2.55-1.22-.63-2.2.22-.53A11 11 0 0 0 32 54.4V52h2v2.4l-.01.57 2.65-1.35 3.3 3.91 2.35-1.12-1.54-4.52.25-.48a16 16 0 0 0 1.83-6.1l.06-.63.05-.6.55-.23 2.59-1.09a1.54 1.54 0 0 0-.49-2.95l-.84-.07-.3-.02-.25-.2zM26.15 11.38q-1.88.59-3.4 1.34c-3.4 1.7-4.75 3.7-4.75 5.29 0 1.6 1.35 3.58 4.75 5.28C26.04 24.93 30.72 26 36 26s9.96-1.07 13.25-2.71C52.65 21.59 54 19.6 54 18s-1.35-3.58-4.75-5.29q-1.52-.76-3.4-1.33.15.73.15 1.5C46 15 43.36 18 36.03 18c-3-.04-10.03-.82-10.03-5.1q0-.78.15-1.52M36 21a1 1 0 1 1 0 2 1 1 0 0 1 0-2m-13-4a1 1 0 1 1 0 2 1 1 0 0 1 0-2m26 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2M36.03 6C31.36 6 28 9.3 28 12.9c0 .18.2.92 1.6 1.72 1.32.76 3.46 1.38 6.43 1.38 3.41 0 5.5-.7 6.65-1.45C43.85 13.8 44 13.1 44 12.9 44 9.3 40.68 6 36.03 6"/></svg>
);
export const StCapitalIcon = ({ size, ...p }: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size ?? 28} height={size ?? 28} fill="none" aria-hidden {...p}><path fill="currentColor" d="M14.001 2.999c6.076 0 11.001 4.926 11.001 11.002s-4.925 11-11.001 11.001S2.998 20.077 2.998 14.001 7.925 2.999 14.001 2.999m0 1c-5.524 0-10.002 4.478-10.002 10.002s4.478 10.001 10.002 10.001c5.523 0 10-4.478 10.001-10.001S19.524 3.999 14.001 3.999M14.498 9h.002a3 3 0 0 1 3 3h-1a2 2 0 0 0-2-2h-1.249a1.75 1.75 0 1 0 0 3.5h1.499a2.75 2.75 0 0 1 0 5.5h-.251v2h-1v-2.001A3 3 0 0 1 10.501 16h1a2 2 0 0 0 1.999 2h1.25a1.75 1.75 0 0 0 0-3.5h-1.499a2.75 2.75 0 1 1 0-5.5h.247V7h1z" /></svg>
);
// The strategy tab's mark (bars under a rising arrow), as the bottom panel's strategy tab shows it
export const StStrategyTabIcon = (p: P) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width={18} height={18} fill="none" aria-hidden {...p}>
    <path fill="currentColor" d="M2 16h3v-4H2zM7.5 16h3V9.5h-3zM13 16h3V7h-3z" />
    <path stroke="currentColor" strokeWidth="1.4" d="M2 9.5 6.5 5l3 2.5L15 2" />
    <path fill="currentColor" d="M16.5 1 16 5.5 12 2z" />
  </svg>
);
