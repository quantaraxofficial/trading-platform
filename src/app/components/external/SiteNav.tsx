"use client";

// The site pages' top bar, the same on every one (home, About, Contact, Q&A, Terms, Privacy): the
// logo, Features / Coming soon, About Us, Leaderboard, Pricing (the home page's sections: scrolled to there, opened from elsewhere),
// About Us, Contact, Log in, "Open the chart" and the account menu; a ☰ menu on phones. Fixed at the
// top, tinted once the page scrolls; off the home page a spacer keeps the content below it. Escape
// or a tap on a link closes the phone menu.
import React, { useCallback, useEffect, useState } from "react";
import { Menu, TrendingUp, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SiteUserMenu from "./SiteUserMenu";

type Active = "/" | "/contact" | "/terms" | "/privacy" | "/faq" | "/leaderboard" | "/pricing";

export default function SiteNav({ active }: { active?: Active }) {
  const { user, loading } = useAuth();
  const home = active === "/";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { setScrolled(window.scrollY > 50); ticking = false; });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // the home page's sections: scrolled to on the home page, opened from the others
  const toSection = useCallback((id: string) => (e: React.MouseEvent) => {
    setOpen(false);
    const el = home ? document.getElementById(id) : null;
    if (!el) return;   // (the link goes to /#id)
    e.preventDefault();
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  }, [home]);

  const link = (href: string) => `transition-colors ${active === href ? "text-white font-semibold" : "text-purple-400 hover:text-white"}`;

  return (
    <>
      <nav data-name="site-nav" className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled || open ? "bg-purple-900/90 backdrop-blur-md shadow-lg" : "bg-transparent"}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center space-x-2 no-underline" aria-label="TradePilot home">
              <span className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center text-white">
                <TrendingUp className="w-6 h-6" />
              </span>
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">TradePilot</span>
            </a>

            {/* wide: the links in a row */}
            <div className="hidden lg:flex items-center space-x-7 whitespace-nowrap">
              <a href="/#features" onClick={toSection("features")} className={link("")}>Features</a>
              <a href="/#coming-soon" onClick={toSection("coming-soon")} className={link("")}>Coming soon</a>
              <a href="/leaderboard" className={link("/leaderboard")}>Leaderboard</a>
              <a href="/pricing" className={link("/pricing")}>Pricing</a>
              <a href="/#about" onClick={toSection("about")} className={link("")}>About Us</a>
              <a href="/contact" className={link("/contact")}>Contact</a>
              {!loading && !user && <a href="/login" className={link("/login")}>Log in</a>}
              <a href="/chart" className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-6 py-2 rounded-lg font-semibold text-white transition-all transform hover:scale-105">
                Open the chart
              </a>
              <SiteUserMenu signedOut={null} />
            </div>

            <button type="button" className="lg:hidden text-white" onClick={() => setOpen(o => !o)} aria-label={open ? "Close the menu" : "Open the menu"} aria-expanded={open}>
              {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* phones: the menu */}
          {open && (
            <div className="lg:hidden mt-4 pb-4 space-y-4">
              <a href="/#features" onClick={toSection("features")} className={`block ${link("")}`}>Features</a>
              <a href="/#coming-soon" onClick={toSection("coming-soon")} className={`block ${link("")}`}>Coming soon</a>
              <a href="/leaderboard" className={`block ${link("/leaderboard")}`}>Leaderboard</a>
              <a href="/pricing" className={`block ${link("/pricing")}`}>Pricing</a>
              <a href="/#about" onClick={toSection("about")} className={`block ${link("")}`}>About Us</a>
              <a href="/contact" className={`block ${link("/contact")}`}>Contact</a>
              <SiteUserMenu mobile signedOut={<a href="/login" className="block text-purple-400 hover:text-white transition-colors">Log in</a>} />
              <a href="/chart" className="block text-center w-full bg-gradient-to-r from-purple-700 to-indigo-700 px-6 py-2 rounded-lg font-semibold text-white transition-all">
                Open the chart
              </a>
            </div>
          )}
        </div>
      </nav>
      {/* (off the home page, whose hero sits under the bar: the content starts below it) */}
      {!home && <div aria-hidden className="h-[72px]" />}
    </>
  );
}
