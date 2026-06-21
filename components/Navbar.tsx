"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";

// ─── Mega menu data ───────────────────────────────────────────────────────────
const megaMenuGroups = [
  {
    heading: "ORGANIZE PDF",
    tools: [
      { label: "Merge PDF",       href: "/merge-pdf",      bg: "#E53E3E", letter: "M" },
      { label: "Split PDF",       href: "/split-pdf",      bg: "#E53E3E", letter: "S" },
      { label: "Remove pages",    href: "/remove-pages",   bg: "#E53E3E", letter: "R" },
      { label: "Extract pages",   href: "/extract-pages",  bg: "#E53E3E", letter: "E" },
      { label: "Organize PDF",    href: "/organize-pdf",   bg: "#E53E3E", letter: "O" },
      { label: "Scan to PDF",     href: "/scan-to-pdf",    bg: "#E53E3E", letter: "S" },
    ],
  },
  {
    heading: "OPTIMIZE PDF",
    tools: [
      { label: "Compress PDF",    href: "/compress-pdf",   bg: "#38A169", letter: "C" },
      { label: "Repair PDF",      href: "/repair-pdf",     bg: "#E53E3E", letter: "R" },
      { label: "OCR PDF",         href: "/ocr-pdf",        bg: "#805AD5", letter: "O" },
    ],
  },
  {
    heading: "CONVERT TO PDF",
    tools: [
      { label: "JPG to PDF",          href: "/jpg-to-pdf",    bg: "#D69E2E", letter: "J" },
      { label: "WORD to PDF",         href: "/word-to-pdf",   bg: "#2B6CB0", letter: "W" },
      { label: "POWERPOINT to PDF",   href: "/ppt-to-pdf",    bg: "#C05621", letter: "P" },
      { label: "EXCEL to PDF",        href: "/excel-to-pdf",  bg: "#276749", letter: "X" },
      { label: "HTML to PDF",         href: "/html-to-pdf",   bg: "#D69E2E", letter: "H" },
    ],
  },
  {
    heading: "CONVERT FROM PDF",
    tools: [
      { label: "PDF to JPG",          href: "/pdf-to-jpg",    bg: "#D69E2E", letter: "J" },
      { label: "PDF to WORD",         href: "/pdf-to-word",   bg: "#2B6CB0", letter: "W" },
      { label: "PDF to POWERPOINT",   href: "/pdf-to-ppt",    bg: "#C05621", letter: "P" },
      { label: "PDF to EXCEL",        href: "/pdf-to-excel",  bg: "#276749", letter: "X" },
      { label: "PDF to PDF/A",        href: "/pdf-to-pdfa",   bg: "#D69E2E", letter: "A" },
    ],
  },
  {
    heading: "EDIT PDF",
    tools: [
      { label: "Rotate PDF",          href: "/rotate-pdf",     bg: "#805AD5", letter: "R" },
      { label: "Add page numbers",    href: "/page-numbers",   bg: "#805AD5", letter: "#" },
      { label: "Add watermark",       href: "/watermark-pdf",  bg: "#805AD5", letter: "W" },
      { label: "Crop PDF",            href: "/crop-pdf",       bg: "#805AD5", letter: "C" },
      { label: "Edit PDF",            href: "/edit-pdf",       bg: "#805AD5", letter: "E" },
      { label: "PDF Forms",           href: "/pdf-forms",      bg: "#805AD5", letter: "F" },
    ],
  },
  {
    heading: "PDF SECURITY",
    tools: [
      { label: "Unlock PDF",    href: "/unlock-pdf",   bg: "#2B6CB0", letter: "U" },
      { label: "Protect PDF",   href: "/protect-pdf",  bg: "#2B6CB0", letter: "P" },
      { label: "Sign PDF",      href: "/sign-pdf",     bg: "#2B6CB0", letter: "S" },
      { label: "Redact PDF",    href: "/redact-pdf",   bg: "#2B6CB0", letter: "R" },
      { label: "Compare PDF",   href: "/compare-pdf",  bg: "#2B6CB0", letter: "C" },
    ],
  },
  {
    heading: "PDF INTELLIGENCE",
    tools: [
      { label: "AI Summarizer",   href: "/ai-summarizer",   bg: "#6B46C1", letter: "A" },
      { label: "Translate PDF",   href: "/translate-pdf",   bg: "#6B46C1", letter: "T" },
    ],
  },
];

const convertDropdown = [
  { label: "JPG to PDF",     href: "/jpg-to-pdf" },
  { label: "WORD to PDF",    href: "/word-to-pdf" },
  { label: "PDF to JPG",     href: "/pdf-to-jpg" },
  { label: "PDF to WORD",    href: "/pdf-to-word" },
  { label: "PDF to PDF/A",   href: "/pdf-to-pdfa" },
];

function ToolBadge({ bg, letter }: { bg: string; letter: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-white text-[11px] font-black shrink-0"
      style={{ backgroundColor: bg }}
    >
      {letter}
    </span>
  );
}

export default function Navbar() {
  const [convertOpen, setConvertOpen] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-navbar]")) {
        setConvertOpen(false);
        setAllToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    // ↓ relative so the mega menu can position absolutely within it
    <header data-navbar className="w-full bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm relative">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-14 gap-0">

          {/* Logo */}
          <Link href="/" className="shrink-0 mr-6 select-none">
            <span className="text-[22px] font-black tracking-tight">
              <span className="text-gray-900">D</span>
              <span className="text-red-600">♥</span>
              <span className="text-gray-900">cify</span>
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center flex-1">
            <Link href="/merge-pdf" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Merge PDF
            </Link>
            <Link href="/split-pdf" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Split PDF
            </Link>
            <Link href="/compress-pdf" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Compress PDF
            </Link>

            {/* Convert PDF — simple dropdown */}
            <div className="relative">
              <button
                onClick={() => { setConvertOpen(!convertOpen); setAllToolsOpen(false); }}
                className="flex items-center gap-1 px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap"
              >
                Convert PDF
                <ChevronDown size={13} className={`transition-transform duration-150 ${convertOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Simple dropdown */}
              {convertOpen && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl border border-gray-100 shadow-xl z-50">
                  {convertDropdown.map((item) => (
                    <Link key={item.href} href={item.href}
                      onClick={() => setConvertOpen(false)}
                      className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* All PDF Tools — mega menu */}
            <button
              onClick={() => { setAllToolsOpen(!allToolsOpen); setConvertOpen(false); }}
              className={`flex items-center gap-1 px-3.5 py-1 text-[13px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                allToolsOpen ? "text-red-600" : "text-gray-700 hover:text-red-600"
              }`}
            >
              All PDF Tools
              <ChevronDown size={13} className={`transition-transform duration-150 ${allToolsOpen ? "rotate-180" : ""}`} />
            </button>
          </nav>

          {/* Auth + grid icon */}
          <div className="hidden md:flex items-center gap-1 shrink-0 ml-auto">
            <Link href="/login" className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors">
              Login
            </Link>
            <Link href="/register" className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
              Sign up
            </Link>
            <button className="ml-1 p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="More">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="3"  cy="3"  r="1.5" fill="currentColor"/>
                <circle cx="9"  cy="3"  r="1.5" fill="currentColor"/>
                <circle cx="15" cy="3"  r="1.5" fill="currentColor"/>
                <circle cx="3"  cy="9"  r="1.5" fill="currentColor"/>
                <circle cx="9"  cy="9"  r="1.5" fill="currentColor"/>
                <circle cx="15" cy="9"  r="1.5" fill="currentColor"/>
                <circle cx="3"  cy="15" r="1.5" fill="currentColor"/>
                <circle cx="9"  cy="15" r="1.5" fill="currentColor"/>
                <circle cx="15" cy="15" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden ml-auto p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ─── MEGA MENU — full-width, anchored to header ─────────────────────── */}
      {allToolsOpen && (
        <div
          className="absolute left-0 right-0 top-full bg-white border-b border-gray-200 shadow-2xl z-50"
          data-navbar
        >
          <div className="max-w-screen-xl mx-auto px-6 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-6">
              {megaMenuGroups.map((group) => (
                <div key={group.heading}>
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-3">
                    {group.heading}
                  </p>
                  <ul className="space-y-2">
                    {group.tools.map((tool) => (
                      <li key={tool.href}>
                        <Link
                          href={tool.href}
                          onClick={() => setAllToolsOpen(false)}
                          className="flex items-center gap-2 group"
                        >
                          <ToolBadge bg={tool.bg} letter={tool.letter} />
                          <span className="text-[13px] text-gray-700 group-hover:text-red-600 transition-colors leading-snug">
                            {tool.label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── MOBILE MENU ─────────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full bg-white border-t border-gray-100 shadow-xl z-50 max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-4">
            <Link href="/merge-pdf"    className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Merge PDF</Link>
            <Link href="/split-pdf"    className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Split PDF</Link>
            <Link href="/compress-pdf" className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Compress PDF</Link>

            {megaMenuGroups.map((group) => (
              <div key={group.heading} className="mt-4">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">{group.heading}</p>
                {group.tools.map((tool) => (
                  <Link key={tool.href} href={tool.href} className="flex items-center gap-2.5 py-2 px-1 hover:bg-red-50 rounded-lg transition-colors">
                    <ToolBadge bg={tool.bg} letter={tool.letter} />
                    <span className="text-sm text-gray-700">{tool.label}</span>
                  </Link>
                ))}
              </div>
            ))}

            <div className="flex gap-3 pt-4 mt-4 border-t border-gray-100">
              <Link href="/login"    className="flex-1 text-center py-2.5 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg">Login</Link>
              <Link href="/register" className="flex-1 text-center py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">Sign up</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
