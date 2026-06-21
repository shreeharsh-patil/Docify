"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";

// ─── Tool data grouped by category ───────────────────────────────────────────
const megaMenuGroups = [
  {
    heading: "ORGANIZE PDF",
    tools: [
      { label: "Merge PDF",      href: "/merge-pdf",      bg: "#E53E3E", icon: "⊞" },
      { label: "Split PDF",      href: "/split-pdf",      bg: "#E53E3E", icon: "✂" },
      { label: "Remove pages",   href: "/remove-pages",   bg: "#E53E3E", icon: "✕" },
      { label: "Extract pages",  href: "/extract-pages",  bg: "#E53E3E", icon: "↗" },
      { label: "Organize PDF",   href: "/organize-pdf",   bg: "#E53E3E", icon: "☰" },
      { label: "Scan to PDF",    href: "/scan-to-pdf",    bg: "#E53E3E", icon: "⊡" },
    ],
  },
  {
    heading: "OPTIMIZE PDF",
    tools: [
      { label: "Compress PDF",   href: "/compress-pdf",   bg: "#38A169", icon: "⊟" },
      { label: "Repair PDF",     href: "/repair-pdf",     bg: "#E53E3E", icon: "⚙" },
      { label: "OCR PDF",        href: "/ocr-pdf",        bg: "#805AD5", icon: "◎" },
    ],
  },
  {
    heading: "CONVERT TO PDF",
    tools: [
      { label: "JPG to PDF",          href: "/jpg-to-pdf",         bg: "#D69E2E", icon: "🖼" },
      { label: "WORD to PDF",         href: "/word-to-pdf",        bg: "#2B6CB0", icon: "W" },
      { label: "POWERPOINT to PDF",   href: "/ppt-to-pdf",         bg: "#C05621", icon: "P" },
      { label: "EXCEL to PDF",        href: "/excel-to-pdf",       bg: "#276749", icon: "X" },
      { label: "HTML to PDF",         href: "/html-to-pdf",        bg: "#D69E2E", icon: "H" },
    ],
  },
  {
    heading: "CONVERT FROM PDF",
    tools: [
      { label: "PDF to JPG",          href: "/pdf-to-jpg",         bg: "#D69E2E", icon: "🖼" },
      { label: "PDF to WORD",         href: "/pdf-to-word",        bg: "#2B6CB0", icon: "W" },
      { label: "PDF to POWERPOINT",   href: "/pdf-to-ppt",         bg: "#C05621", icon: "P" },
      { label: "PDF to EXCEL",        href: "/pdf-to-excel",       bg: "#276749", icon: "X" },
      { label: "PDF to PDF/A",        href: "/pdf-to-pdfa",        bg: "#D69E2E", icon: "A" },
    ],
  },
  {
    heading: "EDIT PDF",
    tools: [
      { label: "Rotate PDF",         href: "/rotate-pdf",         bg: "#805AD5", icon: "↻" },
      { label: "Add page numbers",   href: "/page-numbers",       bg: "#805AD5", icon: "⊞" },
      { label: "Add watermark",      href: "/watermark-pdf",      bg: "#805AD5", icon: "≋" },
      { label: "Crop PDF",           href: "/crop-pdf",           bg: "#805AD5", icon: "⊡" },
      { label: "Edit PDF",           href: "/edit-pdf",           bg: "#805AD5", icon: "✎" },
      { label: "PDF Forms",          href: "/pdf-forms",          bg: "#805AD5", icon: "☰" },
    ],
  },
  {
    heading: "PDF SECURITY",
    tools: [
      { label: "Unlock PDF",   href: "/unlock-pdf",   bg: "#2B6CB0", icon: "🔓" },
      { label: "Protect PDF",  href: "/protect-pdf",  bg: "#2B6CB0", icon: "🔒" },
      { label: "Sign PDF",     href: "/sign-pdf",     bg: "#2B6CB0", icon: "✍" },
      { label: "Redact PDF",   href: "/redact-pdf",   bg: "#2B6CB0", icon: "▬" },
      { label: "Compare PDF",  href: "/compare-pdf",  bg: "#2B6CB0", icon: "⇌" },
    ],
  },
  {
    heading: "PDF INTELLIGENCE",
    tools: [
      { label: "AI Summarizer",  href: "/ai-summarizer",  bg: "#6B46C1", icon: "✦" },
      { label: "Translate PDF",  href: "/translate-pdf",  bg: "#6B46C1", icon: "⇄" },
    ],
  },
];

// Simple dropdown items for "Convert PDF"
const convertDropdown = [
  { label: "JPG to PDF",       href: "/jpg-to-pdf" },
  { label: "WORD to PDF",      href: "/word-to-pdf" },
  { label: "PDF to JPG",       href: "/pdf-to-jpg" },
  { label: "PDF to WORD",      href: "/pdf-to-word" },
  { label: "PDF to PDF/A",     href: "/pdf-to-pdfa" },
];

// ─── Small icon badge ─────────────────────────────────────────────────────────
function ToolIcon({ bg, icon }: { bg: string; icon: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-[5px] text-white text-[11px] font-bold shrink-0 leading-none"
      style={{ backgroundColor: bg }}
    >
      {icon}
    </span>
  );
}

// ─── Simple single-column dropdown ───────────────────────────────────────────
function SimpleDropdown({ items, isOpen }: { items: typeof convertDropdown; isOpen: boolean }) {
  return (
    <div
      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden transition-all duration-200 z-50 ${
        isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Mega menu dropdown ───────────────────────────────────────────────────────
function MegaMenu({ isOpen }: { isOpen: boolean }) {
  return (
    <div
      className={`absolute top-full right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 transition-all duration-200 z-50 ${
        isOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
      style={{ minWidth: "900px" }}
    >
      <div className="p-6 grid grid-cols-3 gap-x-8 gap-y-6 xl:grid-cols-6 xl:gap-x-6">
        {megaMenuGroups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-1 uppercase">
              {group.heading}
            </p>
            {group.tools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex items-center gap-2 group"
              >
                <ToolIcon bg={tool.bg} icon={tool.icon} />
                <span className="text-[13px] text-gray-700 group-hover:text-red-600 transition-colors leading-snug">
                  {tool.label}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Navbar ─────────────────────────────────────────────────────────────
export default function Navbar() {
  const [convertOpen, setConvertOpen] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const convertRef = useRef<HTMLDivElement>(null);
  const allToolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (convertRef.current && !convertRef.current.contains(e.target as Node)) setConvertOpen(false);
      if (allToolsRef.current && !allToolsRef.current.contains(e.target as Node)) setAllToolsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center shrink-0 select-none">
            <span className="text-[22px] font-black tracking-tight">
              <span className="text-gray-900">I</span>
              <span className="text-red-600">♥</span>
              <span className="text-gray-900">PDF</span>
            </span>
          </Link>

          {/* ── Desktop Nav ── */}
          <nav className="hidden md:flex items-center gap-0 flex-1 justify-start pl-8">
            <Link href="/merge-pdf" className="px-4 py-1.5 text-[13px] font-bold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors whitespace-nowrap">
              Merge PDF
            </Link>
            <Link href="/split-pdf" className="px-4 py-1.5 text-[13px] font-bold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors whitespace-nowrap">
              Split PDF
            </Link>
            <Link href="/compress-pdf" className="px-4 py-1.5 text-[13px] font-bold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors whitespace-nowrap">
              Compress PDF
            </Link>

            {/* Convert PDF dropdown */}
            <div className="relative" ref={convertRef}>
              <button
                onClick={() => { setConvertOpen(!convertOpen); setAllToolsOpen(false); }}
                className="flex items-center gap-1 px-4 py-1.5 text-[13px] font-bold text-gray-700 hover:text-red-600 tracking-wide uppercase transition-colors whitespace-nowrap"
              >
                Convert PDF
                <ChevronDown size={13} className={`transition-transform duration-200 ${convertOpen ? "rotate-180" : ""}`} />
              </button>
              <SimpleDropdown items={convertDropdown} isOpen={convertOpen} />
            </div>

            {/* All PDF Tools mega menu */}
            <div className="relative" ref={allToolsRef}>
              <button
                onClick={() => { setAllToolsOpen(!allToolsOpen); setConvertOpen(false); }}
                className={`flex items-center gap-1 px-4 py-1.5 text-[13px] font-bold tracking-wide uppercase transition-colors whitespace-nowrap ${
                  allToolsOpen ? "text-red-600" : "text-gray-700 hover:text-red-600"
                }`}
              >
                All PDF Tools
                <ChevronDown size={13} className={`transition-transform duration-200 ${allToolsOpen ? "rotate-180 text-red-600" : ""}`} />
              </button>
              <MegaMenu isOpen={allToolsOpen} />
            </div>
          </nav>

          {/* ── Auth Buttons ── */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            <Link href="/login" className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors">
              Login
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Sign up
            </Link>
            {/* 9-dot grid icon */}
            <button className="ml-1 p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="More">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="3" cy="3" r="1.5" fill="currentColor"/>
                <circle cx="9" cy="3" r="1.5" fill="currentColor"/>
                <circle cx="15" cy="3" r="1.5" fill="currentColor"/>
                <circle cx="3" cy="9" r="1.5" fill="currentColor"/>
                <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
                <circle cx="15" cy="9" r="1.5" fill="currentColor"/>
                <circle cx="3" cy="15" r="1.5" fill="currentColor"/>
                <circle cx="9" cy="15" r="1.5" fill="currentColor"/>
                <circle cx="15" cy="15" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>

          {/* ── Mobile Toggle ── */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu ── */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 max-h-[80vh] overflow-y-auto animate-slide-up">
          <Link href="/merge-pdf" className="block py-3 px-2 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Merge PDF</Link>
          <Link href="/split-pdf" className="block py-3 px-2 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Split PDF</Link>
          <Link href="/compress-pdf" className="block py-3 px-2 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Compress PDF</Link>

          {megaMenuGroups.map((group) => (
            <div key={group.heading} className="mt-4">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-2 mb-2">{group.heading}</p>
              {group.tools.map((tool) => (
                <Link key={tool.href} href={tool.href} className="flex items-center gap-2.5 py-2 px-2 hover:bg-red-50 rounded-lg transition-colors">
                  <ToolIcon bg={tool.bg} icon={tool.icon} />
                  <span className="text-sm text-gray-700">{tool.label}</span>
                </Link>
              ))}
            </div>
          ))}

          <div className="flex gap-3 pt-4 mt-4 border-t border-gray-100">
            <Link href="/login" className="flex-1 text-center py-2.5 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg hover:border-red-300 transition-colors">Login</Link>
            <Link href="/register" className="flex-1 text-center py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Sign up</Link>
          </div>
        </div>
      )}
    </header>
  );
}
