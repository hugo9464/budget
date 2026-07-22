import type { SVGProps } from "react";

const paths: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
  basket: <><path d="m5 10 2-6m12 6-2-6M3 10h18l-2 10H5L3 10Z"/><path d="M9 14v2m6-2v2"/></>,
  utensils: <><path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M17 3v18M17 3c3 2 3 8 0 10"/></>,
  car: <><path d="m5 16-1 3m15-3 1 3M3 13l2-6h14l2 6v5H3v-5Z"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/></>,
  heart: <path d="M20.8 5.7a5.5 5.5 0 0 0-7.8 0L12 6.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z"/>,
  repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
  sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></>,
  plane: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
  landmark: <><path d="m3 10 9-7 9 7M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/></>,
  piggy: <><path d="M19 8a7 7 0 0 0-13 2H3v5h3a7 7 0 0 0 4 3v3h3v-2h3v2h3v-4a7 7 0 0 0 2-5c0-1-.2-2-.6-3L22 7"/><circle cx="16" cy="10" r=".5"/></>,
  wallet: <><path d="M3 6h16a2 2 0 0 1 2 2v11H3V6Z"/><path d="M3 6V4h14v2m0 6h4m-4 0a1 1 0 1 0 0 2"/></>,
  arrows: <><path d="M7 7h12l-3-3m3 3-3 3M17 17H5l3 3m-3-3 3-3"/></>,
  dots: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 3.2 2.4c-.8.3-.8 1-.8 1.6M12 17h.01"/></>,
  chart: <><path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  refresh: <><path d="M20 7h-5V2"/><path d="M20 7a8 8 0 1 0 1 8"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  bank: <><path d="m3 10 9-7 9 7M5 10h14M6 10v8m6-8v8m6-8v8M3 21h18"/></>,
  logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4m4-4H8"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  "arrow-up": <><path d="m12 19V5"/><path d="m6 11 6-6 6 6"/></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] ?? paths.dots}</svg>;
}
