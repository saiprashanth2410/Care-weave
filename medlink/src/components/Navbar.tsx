"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Moon,
  QrCode,
  ShieldCheck,
  Siren,
  Sun,
  UserPen,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/theme";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: QrCode, label: "Share Access", path: "/share" },
  { icon: Siren, label: "Emergency", path: "/emergency" },
  { icon: UserPen, label: "Profile", path: "/profile" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userName = "User";

  // The doctor view is opened by someone else: hide the patient's navigation.
  const isDoctorView = pathname.startsWith("/doctor/");

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setUserMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  const close = () => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  };

  return (
    <>
      <header className="bg-[#0284c7] dark:bg-slate-900 text-white sticky top-0 z-40 border-b border-[#0369a1]/40 dark:border-slate-800 shadow-2xs transition-colors duration-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          {/* Logo */}
          <Link href={isDoctorView ? pathname : "/"} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shadow-2xs shrink-0 border border-transparent dark:border-slate-700/80">
              <HeartPulse size={18} className="text-[#0284c7] dark:text-sky-400" strokeWidth={2.3} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">MedLink</p>
              <p className="text-[9px] uppercase tracking-widest text-white/70 dark:text-slate-400 font-medium">
                {isDoctorView ? "Clinician View" : "Unified Health Record"}
              </p>
            </div>
          </Link>

          {/* Desktop Nav */}
          {!isDoctorView && (
            <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2">
              {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
                const isActive = pathname === path;
                return (
                  <Link
                    key={path}
                    href={path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-white/15 dark:bg-sky-500/20 text-white dark:text-sky-300 font-semibold"
                        : "text-white/80 dark:text-slate-300 hover:bg-white/10 dark:hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggle}
              className="p-2 rounded-lg bg-white/15 dark:bg-slate-800 dark:border dark:border-slate-700/80 hover:bg-white/20 dark:hover:bg-slate-700 transition"
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {!isDoctorView && (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 sm:gap-3 px-1.5 sm:px-2 py-1 rounded-md hover:bg-white/10 transition"
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                >
                  <div className="hidden sm:block text-right">
                    <p className="text-sm font-semibold leading-tight">{userName}</p>
                    <p className="text-[10px] text-white/60 leading-tight">Patient</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0 ring-2 ring-white/30">
                    {userName[0]?.toUpperCase()}
                  </div>
                  <ChevronDown size={14} className={`hidden sm:block transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-fade-up">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-br from-sky-50 to-white dark:from-slate-800 dark:to-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0284c7] to-[#0369a1] flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0 ring-2 ring-[#0284c7]/20">
                          {userName[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{userName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Signed in
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-[#0284c7] dark:text-sky-300 text-[10px] font-medium">
                        <ShieldCheck size={10} />
                        Record owner
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      {NAV_ITEMS.slice(1).map(({ icon: Icon, label, path }) => (
                        <Link
                          key={path}
                          href={path}
                          onClick={close}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-[#0284c7] dark:hover:text-sky-300 transition"
                        >
                          <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Icon size={14} className="text-slate-600 dark:text-slate-300" />
                          </div>
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isDoctorView && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-white/10 transition"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[280px] bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[#0284c7] flex items-center justify-center">
                  <HeartPulse size={18} className="text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Menu</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{userName}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold px-3 mb-2">
                Overview
              </p>
              {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
                const isActive = pathname === path;
                return (
                  <Link
                    key={path}
                    href={path}
                    onClick={close}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition mb-1 ${
                      isActive
                        ? "bg-sky-50 dark:bg-sky-950/60 text-[#0284c7] dark:text-sky-300"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
