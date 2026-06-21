"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu, X } from "lucide-react";

// ─── Mega menu data ───────────────────────────────────────────────────────────
const megaMenuGroups = [
  {
    heading: "ORGANIZE PDF",
    tools: [
      { label: "Merge PDF",       href: "/?tool=merge",          bg: "#E53E3E", letter: "M" },
      { label: "Split PDF",       href: "/?tool=split",          bg: "#E53E3E", letter: "S" },
      { label: "Remove pages",    href: "/?tool=remove-pages",   bg: "#E53E3E", letter: "R" },
      { label: "Extract pages",   href: "/?tool=extract-pages",  bg: "#E53E3E", letter: "E" },
      { label: "Organize PDF",    href: "/?tool=organize",       bg: "#E53E3E", letter: "O" },
      { label: "Scan to PDF",     href: "/?tool=scan",           bg: "#E53E3E", letter: "S" },
    ],
  },
  {
    heading: "OPTIMIZE PDF",
    tools: [
      { label: "Compress PDF",    href: "/?tool=compress",       bg: "#38A169", letter: "C" },
      { label: "Repair PDF",      href: "/?tool=repair",         bg: "#E53E3E", letter: "R" },
      { label: "OCR PDF",         href: "/?tool=ocr",            bg: "#805AD5", letter: "O" },
    ],
  },
  {
    heading: "CONVERT TO PDF",
    tools: [
      { label: "JPG to PDF",          href: "/?tool=jpg-to-pdf",   bg: "#D69E2E", letter: "J" },
      { label: "WORD to PDF",         href: "/?tool=word-to-pdf",  bg: "#2B6CB0", letter: "W" },
      { label: "POWERPOINT to PDF",   href: "/?tool=ppt-to-pdf",   bg: "#C05621", letter: "P" },
      { label: "EXCEL to PDF",        href: "/?tool=excel-to-pdf", bg: "#276749", letter: "X" },
      { label: "HTML to PDF",         href: "/?tool=html-to-pdf",  bg: "#D69E2E", letter: "H" },
    ],
  },
  {
    heading: "CONVERT FROM PDF",
    tools: [
      { label: "PDF to JPG",          href: "/?tool=pdf-to-jpg",   bg: "#D69E2E", letter: "J" },
      { label: "PDF to WORD",         href: "/?tool=pdf-to-word",  bg: "#2B6CB0", letter: "W" },
      { label: "PDF to POWERPOINT",   href: "/?tool=pdf-to-ppt",   bg: "#C05621", letter: "P" },
      { label: "PDF to EXCEL",        href: "/?tool=pdf-to-excel", bg: "#276749", letter: "X" },
      { label: "PDF to PDF/A",        href: "/?tool=pdf-to-pdfa",  bg: "#D69E2E", letter: "A" },
    ],
  },
  {
    heading: "EDIT PDF",
    tools: [
      { label: "Rotate PDF",          href: "/?tool=rotate",        bg: "#805AD5", letter: "R" },
      { label: "Add page numbers",    href: "/?tool=page-numbers",  bg: "#805AD5", letter: "#" },
      { label: "Add watermark",       href: "/?tool=watermark",     bg: "#805AD5", letter: "W" },
      { label: "Crop PDF",            href: "/?tool=crop",          bg: "#805AD5", letter: "C" },
      { label: "Edit PDF",            href: "/?tool=edit",          bg: "#805AD5", letter: "E" },
      { label: "PDF Forms",           href: "/?tool=forms",         bg: "#805AD5", letter: "F" },
    ],
  },
  {
    heading: "PDF SECURITY",
    tools: [
      { label: "Unlock PDF",    href: "/?tool=unlock",   bg: "#2B6CB0", letter: "U" },
      { label: "Protect PDF",   href: "/?tool=protect",  bg: "#2B6CB0", letter: "P" },
      { label: "Sign PDF",      href: "/?tool=sign",     bg: "#2B6CB0", letter: "S" },
      { label: "Redact PDF",    href: "/?tool=redact",   bg: "#2B6CB0", letter: "R" },
      { label: "Compare PDF",   href: "/?tool=compare",  bg: "#2B6CB0", letter: "C" },
    ],
  },
  {
    heading: "PDF INTELLIGENCE",
    tools: [
      { label: "AI Summarizer",   href: "/?tool=ai-summarizer",   bg: "#6B46C1", letter: "A" },
      { label: "Translate PDF",   href: "/?tool=translate",       bg: "#6B46C1", letter: "T" },
    ],
  },
];

const convertGroups = [
  {
    heading: "CONVERT TO PDF",
    tools: [
      { label: "JPG to PDF",        href: "/?tool=jpg-to-pdf",   bg: "#D69E2E", letter: "J" },
      { label: "WORD to PDF",       href: "/?tool=word-to-pdf",  bg: "#2B6CB0", letter: "W" },
      { label: "POWERPOINT to PDF", href: "/?tool=ppt-to-pdf",   bg: "#C05621", letter: "P" },
      { label: "EXCEL to PDF",      href: "/?tool=excel-to-pdf", bg: "#276749", letter: "X" },
      { label: "HTML to PDF",       href: "/?tool=html-to-pdf",  bg: "#D69E2E", letter: "H" },
    ],
  },
  {
    heading: "CONVERT FROM PDF",
    tools: [
      { label: "PDF to JPG",        href: "/?tool=pdf-to-jpg",   bg: "#D69E2E", letter: "J" },
      { label: "PDF to WORD",       href: "/?tool=pdf-to-word",  bg: "#2B6CB0", letter: "W" },
      { label: "PDF to POWERPOINT", href: "/?tool=pdf-to-ppt",   bg: "#C05621", letter: "P" },
      { label: "PDF to EXCEL",      href: "/?tool=pdf-to-excel", bg: "#276749", letter: "X" },
      { label: "PDF to PDF/A",      href: "/?tool=pdf-to-pdfa",  bg: "#D69E2E", letter: "A" },
    ],
  },
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
  const [productsOpen, setProductsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-navbar]")) {
        setConvertOpen(false);
        setAllToolsOpen(false);
        setProductsOpen(false);
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
          <Link href="/" className="shrink-0 mr-6 select-none flex items-center">
            <Image 
              src="/logo.png" 
              alt="Docify Logo" 
              width={200} 
              height={66} 
              className="h-14 w-auto object-contain scale-125 origin-left"
              priority
            />
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center flex-1">
            <Link href="/?tool=merge" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Merge PDF
            </Link>
            <Link href="/?tool=split" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Split PDF
            </Link>
            <Link href="/?tool=compress" className="px-3.5 py-1 text-[13px] font-bold text-gray-700 hover:text-red-600 uppercase tracking-wide transition-colors whitespace-nowrap">
              Compress PDF
            </Link>

            {/* Convert PDF — 2-column mega menu (anchored to header) */}
            <button
              onClick={() => { setConvertOpen(!convertOpen); setAllToolsOpen(false); }}
              className={`flex items-center gap-1 px-3.5 py-1 text-[13px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                convertOpen ? "text-red-600" : "text-gray-700 hover:text-red-600"
              }`}
            >
              Convert PDF
              <ChevronDown size={13} className={`transition-transform duration-150 ${convertOpen ? "rotate-180" : ""}`} />
            </button>

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
            <Link href="/?auth=login" className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors">
              Login
            </Link>
            <Link href="/?auth=signup" className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
              Sign up
            </Link>
            <div className="relative">
              <button 
                onClick={() => { setProductsOpen(!productsOpen); setConvertOpen(false); setAllToolsOpen(false); }}
                className={`ml-1 p-2 rounded-lg transition-colors ${productsOpen ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:text-red-600 hover:bg-gray-100'}`}
                aria-label="More Products"
              >
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

      {/* ─── CONVERT PDF MEGA MENU — 2 columns, full-width ───────────────────── */}
      {convertOpen && (
        <div className="absolute left-0 right-0 top-full bg-white border-b border-gray-200 shadow-2xl z-50" data-navbar>
          <div className="max-w-screen-xl mx-auto px-6 py-6">
            <div className="grid grid-cols-2 gap-8">
              {convertGroups.map((group) => (
                <div key={group.heading}>
                  <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-4">
                    {group.heading}
                  </p>
                  <ul className="space-y-3">
                    {group.tools.map((tool) => (
                      <li key={tool.href}>
                        <Link
                          href={tool.href}
                          onClick={() => setConvertOpen(false)}
                          className="flex items-center gap-2.5 group"
                        >
                          <ToolBadge bg={tool.bg} letter={tool.letter} />
                          <span className="text-[14px] text-gray-700 group-hover:text-red-600 transition-colors font-medium">
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

      {/* ─── ALL PDF TOOLS MEGA MENU — full-width, 7 columns ─────────────────── */}
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

      {/* ─── PRODUCTS MENU — anchored to the right ────────────────────────────── */}
      {productsOpen && (
        <div
          className="absolute right-0 sm:right-6 top-full mt-2 w-[550px] max-w-[100vw] bg-white rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] border border-gray-100 z-50 overflow-hidden"
          data-navbar
        >
          <div className="flex flex-col sm:flex-row w-full">
            
            {/* Middle Column: Solutions & Applications */}
            <div className="w-full sm:w-[60%] p-6 sm:p-8 bg-white border-b sm:border-b-0 sm:border-r border-gray-100 flex flex-col justify-between gap-8">
              <div>
                <h3 className="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-4">Solutions</h3>
                <Link href="/business" onClick={() => setProductsOpen(false)} className="flex items-start gap-4 group">
                  <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center shrink-0 overflow-hidden">
                    <div className="flex items-end h-8 gap-1">
                      <div className="w-2.5 h-4 bg-red-800 rounded-sm"></div>
                      <div className="w-2.5 h-8 bg-red-600 rounded-sm"></div>
                      <div className="w-2.5 h-6 bg-red-400 rounded-sm"></div>
                    </div>
                  </div>
                  <div className="pt-1">
                    <h4 className="text-[15px] font-bold text-gray-800 group-hover:text-red-600 transition-colors">Business</h4>
                    <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">Streamlined PDF editing and workflows for business teams</p>
                  </div>
                </Link>
              </div>
              
              <div>
                <h3 className="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-4">Applications</h3>
                <div className="space-y-4">
                  <Link href="/desktop" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-red-500 border border-gray-100 shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-800 group-hover:text-red-600 transition-colors">Desktop App</h4>
                      <p className="text-[11px] text-gray-500">Available for Mac and Windows</p>
                    </div>
                  </Link>

                  <Link href="/mobile" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-red-500 border border-gray-100 shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-gray-800 group-hover:text-red-600 transition-colors">Mobile App</h4>
                      <p className="text-[11px] text-gray-500">Available for iOS and Android</p>
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* Right Column: Links */}
            <div className="w-full sm:w-[40%] p-6 sm:p-8 bg-white flex flex-col">
              <ul className="space-y-4 mb-6">
                <li><Link href="/pricing" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>Pricing</Link></li>
                <li><Link href="/security" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>Security</Link></li>
                <li><Link href="/features" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>Features</Link></li>
                <li><Link href="/about" onClick={() => setProductsOpen(false)} className="flex items-center gap-3 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>About us</Link></li>
              </ul>
              
              <div className="border-t border-gray-100 pt-6 mt-auto space-y-4">
                <Link href="/help" onClick={() => setProductsOpen(false)} className="flex items-center gap-2.5 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Help
                </Link>
                <Link href="/language" onClick={() => setProductsOpen(false)} className="flex items-center gap-2.5 text-[14px] font-medium text-gray-700 hover:text-red-600 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg> Language
                </Link>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─── MOBILE MENU ─────────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full bg-white border-t border-gray-100 shadow-xl z-50 max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-4">
            <Link href="/?tool=merge"    className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Merge PDF</Link>
            <Link href="/?tool=split"    className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Split PDF</Link>
            <Link href="/?tool=compress" className="block py-3 text-sm font-bold text-gray-700 hover:text-red-600 border-b border-gray-100 uppercase">Compress PDF</Link>

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
              <Link href="/?auth=login"    className="flex-1 text-center py-2.5 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg">Login</Link>
              <Link href="/?auth=signup" className="flex-1 text-center py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">Sign up</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
