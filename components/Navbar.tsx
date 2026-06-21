"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X, FileText, Scissors, Archive, RefreshCw, FileImage, Lock, Unlock, RotateCw, Stamp, Hash, Merge } from "lucide-react";

const convertTools = [
  { label: "PDF to Word", href: "/pdf-to-word", icon: FileText },
  { label: "Word to PDF", href: "/word-to-pdf", icon: FileText },
  { label: "PDF to JPG", href: "/pdf-to-jpg", icon: FileImage },
  { label: "JPG to PDF", href: "/jpg-to-pdf", icon: FileImage },
];

const allTools = [
  { label: "Merge PDF", href: "/merge-pdf", icon: Merge },
  { label: "Split PDF", href: "/split-pdf", icon: Scissors },
  { label: "Compress PDF", href: "/compress-pdf", icon: Archive },
  { label: "Rotate PDF", href: "/rotate-pdf", icon: RotateCw },
  { label: "Watermark PDF", href: "/watermark-pdf", icon: Stamp },
  { label: "Protect PDF", href: "/protect-pdf", icon: Lock },
  { label: "Unlock PDF", href: "/unlock-pdf", icon: Unlock },
  { label: "Organize PDF", href: "/organize-pdf", icon: Hash },
];

function DropdownMenu({
  items,
  isOpen,
}: {
  items: { label: string; href: string; icon: React.ElementType }[];
  isOpen: boolean;
}) {
  return (
    <div
      className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden transition-all duration-200 z-50 ${
        isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors group"
          >
            <Icon size={16} className="text-gray-400 group-hover:text-red-500 transition-colors shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function Navbar() {
  const [convertOpen, setConvertOpen] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const convertRef = useRef<HTMLDivElement>(null);
  const allToolsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (convertRef.current && !convertRef.current.contains(e.target as Node)) {
        setConvertOpen(false);
      }
      if (allToolsRef.current && !allToolsRef.current.contains(e.target as Node)) {
        setAllToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 shrink-0 group">
            <span className="text-2xl font-black tracking-tight select-none">
              <span className="text-gray-900">D</span>
              <span className="text-red-600">❤</span>
              <span className="text-gray-900">ci</span>
              <span className="text-red-600">fy</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {/* Merge PDF */}
            <Link
              href="/merge-pdf"
              className="px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors"
            >
              Merge PDF
            </Link>

            {/* Split PDF */}
            <Link
              href="/split-pdf"
              className="px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors"
            >
              Split PDF
            </Link>

            {/* Compress PDF */}
            <Link
              href="/compress-pdf"
              className="px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors"
            >
              Compress PDF
            </Link>

            {/* Convert PDF Dropdown */}
            <div className="relative" ref={convertRef}>
              <button
                onClick={() => { setConvertOpen(!convertOpen); setAllToolsOpen(false); }}
                className="flex items-center gap-1 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors"
              >
                Convert PDF
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${convertOpen ? "rotate-180" : ""}`}
                />
              </button>
              <DropdownMenu items={convertTools} isOpen={convertOpen} />
            </div>

            {/* All PDF Tools Dropdown */}
            <div className="relative" ref={allToolsRef}>
              <button
                onClick={() => { setAllToolsOpen(!allToolsOpen); setConvertOpen(false); }}
                className="flex items-center gap-1 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors"
              >
                All PDF Tools
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${allToolsOpen ? "rotate-180" : ""}`}
                />
              </button>
              <DropdownMenu items={allTools} isOpen={allToolsOpen} />
            </div>
          </nav>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
            >
              Sign up
            </Link>

            {/* Grid icon (apps menu) */}
            <button
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="More apps"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="3" cy="3" r="1.5" fill="currentColor" />
                <circle cx="9" cy="3" r="1.5" fill="currentColor" />
                <circle cx="15" cy="3" r="1.5" fill="currentColor" />
                <circle cx="3" cy="9" r="1.5" fill="currentColor" />
                <circle cx="9" cy="9" r="1.5" fill="currentColor" />
                <circle cx="15" cy="9" r="1.5" fill="currentColor" />
                <circle cx="3" cy="15" r="1.5" fill="currentColor" />
                <circle cx="9" cy="15" r="1.5" fill="currentColor" />
                <circle cx="15" cy="15" r="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 flex flex-col gap-1 animate-slide-up">
          <Link href="/merge-pdf" className="py-3 px-2 text-sm font-semibold text-gray-700 hover:text-red-600 border-b border-gray-100 transition-colors">Merge PDF</Link>
          <Link href="/split-pdf" className="py-3 px-2 text-sm font-semibold text-gray-700 hover:text-red-600 border-b border-gray-100 transition-colors">Split PDF</Link>
          <Link href="/compress-pdf" className="py-3 px-2 text-sm font-semibold text-gray-700 hover:text-red-600 border-b border-gray-100 transition-colors">Compress PDF</Link>
          <p className="pt-3 pb-1 px-2 text-xs text-gray-400 uppercase tracking-widest font-semibold">Convert PDF</p>
          {convertTools.map((t) => (
            <Link key={t.href} href={t.href} className="py-2 px-4 text-sm text-gray-600 hover:text-red-600 transition-colors">{t.label}</Link>
          ))}
          <p className="pt-3 pb-1 px-2 text-xs text-gray-400 uppercase tracking-widest font-semibold">All Tools</p>
          {allTools.map((t) => (
            <Link key={t.href} href={t.href} className="py-2 px-4 text-sm text-gray-600 hover:text-red-600 transition-colors">{t.label}</Link>
          ))}
          <div className="flex gap-3 pt-4 mt-2 border-t border-gray-100">
            <Link href="/login" className="flex-1 text-center py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-lg hover:border-red-300 transition-colors">Login</Link>
            <Link href="/register" className="flex-1 text-center py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Sign up</Link>
          </div>
        </div>
      )}
    </header>
  );
}
