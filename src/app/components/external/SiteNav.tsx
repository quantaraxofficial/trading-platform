"use client";

// The top bar of the site's About and Contact pages: the links in a row on wide screens, a ☰ menu
// on phones and narrow windows (so nothing runs off the screen); the account menu or Sign In stays
// in sight on both. Escape or a tap on a link closes the menu.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, Zap } from "lucide-react";
import SiteUserMenu from "./SiteUserMenu";

const LINKS: [string, string][] = [["/", "Home"], ["/chart", "Chart"], ["/about", "About Us"], ["/contact", "Contact"]];

export default function SiteNav({ active }: { active: "/about" | "/contact" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const signIn = (small: boolean) => (
    <Link href="/login" className={`rounded-lg bg-purple-600 hover:bg-purple-700 font-semibold text-white no-underline whitespace-nowrap ${small ? "px-3 py-2 text-sm" : "px-6 py-2.5 text-[15px]"}`}>Sign In</Link>
  );
  return (
    <nav className="relative z-20 mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-5 sm:px-8 sm:py-6">
      <Link href="/" className="flex items-center gap-2 text-xl sm:text-2xl font-extrabold no-underline"
        style={{ background: "linear-gradient(to right, #a78bfa, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        <Zap size={24} style={{ color: "#8b5cf6", fill: "#8b5cf6" }} />
        TradePilot
      </Link>
      {/* wide: the links in a row */}
      <div className="hidden md:flex items-center gap-8">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={`no-underline text-[15px] ${href === active ? "text-white font-semibold" : "text-slate-300 hover:text-white"}`}>{label}</Link>
        ))}
        <SiteUserMenu signedOut={signIn(false)} />
      </div>
      {/* narrow: the account and a menu */}
      <div className="flex md:hidden items-center gap-2">
        <SiteUserMenu signedOut={signIn(true)} />
        <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(o => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="md:hidden absolute left-4 right-4 top-full z-30 rounded-xl border border-purple-800/50 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={`block rounded-lg px-4 py-3 no-underline text-base ${href === active ? "bg-purple-900/40 text-white font-semibold" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{label}</Link>
          ))}
        </div>
      )}
    </nav>
  );
}
