'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import PdfWorkspace from '@/components/PdfWorkspace';
import AuthModal from '@/components/AuthModal';
import { 
  FileText, Sliders, Type, Lock, Unlock, Edit, 
  Image as ImageIcon, RotateCw, Split, Layers, FolderClosed, 
  Sparkles, ChevronRight, FileUp,
  Camera, Printer, Table, Presentation, Grid, Scissors,
  Edit3, ShieldAlert, Eye, FileSearch, ArrowLeftRight, Activity
} from 'lucide-react';

interface PdfTool {
  id: string;
  name: string;
  desc: string;
  category: 'Organize' | 'Convert' | 'Optimize' | 'Security';
  icon: React.ReactNode;
}

// Map URL slug → tool id + name (module-level constant)
const toolSlugMap: Record<string, { id: string; name: string }> = {
    'merge':         { id: 'merge',        name: 'Merge PDF' },
    'merge-pdf':     { id: 'merge',        name: 'Merge PDF' },
    'split':         { id: 'split',        name: 'Split PDF' },
    'split-pdf':     { id: 'split',        name: 'Split PDF' },
    'compress':      { id: 'compress',     name: 'Compress PDF' },
    'compress-pdf':  { id: 'compress',     name: 'Compress PDF' },
    'organize':      { id: 'organize',     name: 'Organize PDF' },
    'organize-pdf':  { id: 'organize',     name: 'Organize PDF' },
    'rotate':        { id: 'rotate',       name: 'Rotate PDF' },
    'rotate-pdf':    { id: 'rotate',       name: 'Rotate PDF' },
    'watermark':     { id: 'watermark',    name: 'Watermark PDF' },
    'watermark-pdf': { id: 'watermark',    name: 'Watermark PDF' },
    'protect':       { id: 'protect',      name: 'Protect PDF' },
    'protect-pdf':   { id: 'protect',      name: 'Protect PDF' },
    'unlock':        { id: 'unlock',       name: 'Unlock PDF' },
    'unlock-pdf':    { id: 'unlock',       name: 'Unlock PDF' },
    'jpg-to-pdf':    { id: 'jpg-to-pdf',   name: 'JPG to PDF' },
    'pdf-to-jpg':    { id: 'pdf-to-jpg',   name: 'PDF to JPG' },
    'word-to-pdf':   { id: 'word-to-pdf',  name: 'Word to PDF' },
    'pdf-to-word':   { id: 'pdf-to-word',  name: 'PDF to Word' },
    'sign':          { id: 'sign',         name: 'Sign PDF' },
    'sign-pdf':      { id: 'sign',         name: 'Sign PDF' },
    'edit':          { id: 'edit',         name: 'Edit PDF' },
    'edit-pdf':      { id: 'edit',         name: 'Edit PDF' },
    'ocr':           { id: 'ocr',          name: 'OCR PDF' },
    'ocr-pdf':       { id: 'ocr',          name: 'OCR PDF' },
    'ai-summarizer': { id: 'ai-summarizer', name: 'AI Summarizer' },
    'translate':     { id: 'translate',    name: 'Translate PDF' },
    'translate-pdf': { id: 'translate',    name: 'Translate PDF' },
    'page-numbers':  { id: 'page-numbers', name: 'Page Numbers' },
    'repair':        { id: 'repair',       name: 'Repair PDF' },
    'remove-pages':  { id: 'remove-pages', name: 'Remove Pages' },
    'extract-pages': { id: 'extract-pages', name: 'Extract Pages' },
    'crop':          { id: 'crop',         name: 'Crop PDF' },
    'scan':          { id: 'scan',         name: 'Scan to PDF' },
    'forms':         { id: 'forms',        name: 'Fill PDF Forms' },
    'redact':        { id: 'redact',       name: 'Redact PDF' },
    'compare':       { id: 'compare',      name: 'Compare PDF' },
    'pdf-to-pdfa':     { id: 'pdf-to-pdfa',     name: 'PDF to PDF/A' },
    'pdf-to-markdown': { id: 'pdf-to-markdown', name: 'PDF to Markdown' },
    'validate-pdfa':   { id: 'validate-pdfa',   name: 'Validate PDF/A' },
    'metadata':        { id: 'metadata',        name: 'Edit Metadata' },
    'add-blank-pages': { id: 'add-blank-pages', name: 'Add Blank Pages' },
    'pdf-to-txt':      { id: 'pdf-to-txt',      name: 'PDF to TXT' },
    'header-footer':   { id: 'header-footer',   name: 'Header & Footer' },
    'flatten-pdf':     { id: 'flatten-pdf',     name: 'Flatten PDF' },
    'excel-to-pdf':  { id: 'excel-to-pdf',  name: 'Excel to PDF' },
    'ppt-to-pdf':    { id: 'ppt-to-pdf',    name: 'PPT to PDF' },
    'html-to-pdf':   { id: 'html-to-pdf',   name: 'HTML to PDF' },
    'pdf-to-excel':  { id: 'pdf-to-excel',  name: 'PDF to Excel' },
    'pdf-to-ppt':    { id: 'pdf-to-ppt',    name: 'PDF to PPT' },
    'txt-to-pdf':    { id: 'txt-to-pdf',    name: 'TXT to PDF' },
    'pdf-to-html':   { id: 'pdf-to-html',   name: 'PDF to HTML' },
    'pdf-to-png':    { id: 'pdf-to-png',    name: 'PDF to PNG' },
    'permissions':   { id: 'permissions',   name: 'Set Permissions' },
    'remove-metadata': { id: 'remove-metadata', name: 'Remove Metadata' },
    'redact-by-search': { id: 'redact-by-search', name: 'Redact by Search' },
    'reverse-pages': { id: 'reverse-pages', name: 'Reverse Pages' },
    'n-up':          { id: 'n-up',          name: 'N-up Layout' },
    'bates-numbering': { id: 'bates-numbering', name: 'Bates Numbering' },
    'form-extract':  { id: 'form-extract',  name: 'Extract Form Data' },
    'validate-pdfua': { id: 'validate-pdfua', name: 'PDF/UA Validator' },
  };

// Inner component that safely uses useSearchParams inside Suspense
function HomeInner() {
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Organize' | 'Convert' | 'Optimize' | 'Security'>('All');

  const searchParams = useSearchParams();
  const router = useRouter();

  // Derive tool from URL query param immediately (not in effect)
  const toolFromUrl = React.useMemo(() => {
    const toolParam = searchParams.get('tool');
    if (toolParam && toolSlugMap[toolParam]) {
      return toolSlugMap[toolParam];
    }
    return null;
  }, [searchParams]);

  // Track user-selected tool separately so both URL and clicks work
  const [userSelectedTool, setUserSelectedTool] = useState<string | null>(null);
  const [userSelectedToolName, setUserSelectedToolName] = useState('');
  const activeTool = userSelectedTool ?? toolFromUrl?.id ?? null;
  const activeToolName = userSelectedToolName ?? toolFromUrl?.name ?? '';

  // Derive auth mode from URL query param
  const authFromUrl = searchParams.get('auth');
  const [userClickedAuth, setUserClickedAuth] = useState<'login' | 'signup' | null>(null);
  const authMode = userClickedAuth ?? (authFromUrl === 'login' ? 'login' : authFromUrl === 'signup' ? 'signup' : null);

  const tools: PdfTool[] = [
    // 1. Organize
    { 
      id: 'merge', 
      name: 'Merge PDF', 
      desc: 'Combine PDFs in the order you want with the easiest PDF merger available.',
      category: 'Organize',
      icon: <Layers className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'split', 
      name: 'Split PDF', 
      desc: 'Separate one page or a whole set for easy conversion into independent PDF files.',
      category: 'Organize',
      icon: <Split className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'organize', 
      name: 'Organize PDF', 
      desc: 'Reorder, delete or rotate PDF pages in your document easily.',
      category: 'Organize',
      icon: <FolderClosed className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'rotate', 
      name: 'Rotate PDF', 
      desc: 'Rotate your PDFs the way you need them. Rotate multiple documents at once!',
      category: 'Organize',
      icon: <RotateCw className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'page-numbers', 
      name: 'Page Numbers', 
      desc: 'Add page numbers to your PDF document. Customize positioning, font size, and color.',
      category: 'Organize',
      icon: <Grid className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'repair', 
      name: 'Repair PDF', 
      desc: 'Recover data from damaged or corrupted PDF files. Rebuild cross-references natively.',
      category: 'Organize',
      icon: <Activity className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'remove-pages', 
      name: 'Remove Pages', 
      desc: 'Delete unwanted pages from your PDF file dynamically client-side.',
      category: 'Organize',
      icon: <Scissors className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'extract-pages', 
      name: 'Extract Pages', 
      desc: 'Extract specified page index ranges from your PDF document client-side.',
      category: 'Organize',
      icon: <FileUp className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'add-blank-pages', 
      name: 'Add Blank Pages', 
      desc: 'Insert blank pages at specified positions within your PDF document.',
      category: 'Organize',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'reverse-pages', 
      name: 'Reverse Pages', 
      desc: 'Reverse the page order of your entire PDF document instantly.',
      category: 'Organize',
      icon: <ArrowLeftRight className="w-8 h-8 text-red-500" />
    },

    // 2. Convert to PDF
    { 
      id: 'jpg-to-pdf', 
      name: 'JPG to PDF', 
      desc: 'Convert images (JPG, PNG) to PDF in seconds. Easily adjust orientation, sizing, and margins.',
      category: 'Convert',
      icon: <ImageIcon className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'word-to-pdf', 
      name: 'Word to PDF', 
      desc: 'Convert DOCX files to PDF documents using local text rendering outlines.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'excel-to-pdf', 
      name: 'Excel to PDF', 
      desc: 'Make XLSX spreadsheets easy to read by converting them to PDF documents.',
      category: 'Convert',
      icon: <Table className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'ppt-to-pdf', 
      name: 'PPT to PDF', 
      desc: 'Convert PowerPoint slides to PDF presentations cleanly.',
      category: 'Convert',
      icon: <Presentation className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'html-to-pdf', 
      name: 'HTML to PDF', 
      desc: 'Convert web pages or raw HTML code into fully formatted PDF documents.',
      category: 'Convert',
      icon: <Printer className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'txt-to-pdf', 
      name: 'TXT to PDF', 
      desc: 'Convert plain text files into cleanly formatted PDF documents.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },

    // 3. Convert from PDF
    { 
      id: 'pdf-to-jpg', 
      name: 'PDF to JPG', 
      desc: 'Extract all images contained within a PDF or convert each page to a JPG image.',
      category: 'Convert',
      icon: <ImageIcon className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-word', 
      name: 'PDF to Word', 
      desc: 'Extract text from a PDF document and export it directly into a clean Word document.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-excel', 
      name: 'PDF to Excel', 
      desc: 'Extract table grids from PDF and convert them to Excel spreadsheets (CSV/XLSX).',
      category: 'Convert',
      icon: <Table className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-ppt', 
      name: 'PDF to PPT', 
      desc: 'Convert your PDF documents into editable PowerPoint presentation slides.',
      category: 'Convert',
      icon: <Presentation className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-pdfa', 
      name: 'PDF to PDF/A', 
      desc: 'Standardize and validate your PDF files to meet PDF/A long-term archiving conformance rules.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-markdown', 
      name: 'PDF to Markdown', 
      desc: 'Convert your PDF documents into clean Markdown format for documentation and note-taking.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'validate-pdfa', 
      name: 'Validate PDF/A', 
      desc: 'Check if your PDF file meets PDF/A archival conformance standards.',
      category: 'Convert',
      icon: <ShieldAlert className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-txt', 
      name: 'PDF to TXT', 
      desc: 'Extract plain text from your PDF documents for editing or analysis.',
      category: 'Convert',
      icon: <FileText className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-html', 
      name: 'PDF to HTML', 
      desc: 'Convert your PDF documents into clean HTML web page format.',
      category: 'Convert',
      icon: <Printer className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'pdf-to-png', 
      name: 'PDF to PNG', 
      desc: 'Extract each PDF page as a high-quality PNG image file.',
      category: 'Convert',
      icon: <ImageIcon className="w-8 h-8 text-red-500" />
    },

    // 4. Security & Optimization
    { 
      id: 'compress', 
      name: 'Compress PDF', 
      desc: 'Reduce file size while optimizing for maximal PDF quality.',
      category: 'Optimize',
      icon: <Sliders className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'watermark', 
      name: 'Watermark PDF', 
      desc: 'Stamp text over your PDF in seconds. Choose typography, opacity and position.',
      category: 'Optimize',
      icon: <Type className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'header-footer', 
      name: 'Header & Footer', 
      desc: 'Add custom header and footer text to every page of your PDF document.',
      category: 'Optimize',
      icon: <Type className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'metadata', 
      name: 'Edit Metadata', 
      desc: 'View and edit PDF document properties like title, author, subject, and keywords.',
      category: 'Optimize',
      icon: <Edit className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'crop', 
      name: 'Crop PDF', 
      desc: 'Trim and adjust PDF margin coordinates and bounding boxes client-side.',
      category: 'Optimize',
      icon: <Scissors className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'remove-metadata', 
      name: 'Remove Metadata', 
      desc: 'Strip all document metadata including title, author, and subject.',
      category: 'Optimize',
      icon: <ShieldAlert className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'bates-numbering', 
      name: 'Bates Numbering', 
      desc: 'Add sequential Bates numbers to every page for legal document identification.',
      category: 'Optimize',
      icon: <Type className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'n-up', 
      name: 'N-up Layout', 
      desc: 'Print multiple PDF pages on a single sheet to save paper.',
      category: 'Optimize',
      icon: <Grid className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'sign', 
      name: 'Sign PDF', 
      desc: 'Sign a document and embed your signature. Sign your PDF document with drawn signatures.',
      category: 'Security',
      icon: <Edit className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'protect', 
      name: 'Protect PDF', 
      desc: 'Encrypt and lock your PDF document with a key password so only authorized eyes see it.',
      category: 'Security',
      icon: <Lock className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'unlock', 
      name: 'Unlock PDF', 
      desc: 'Decrypt key-encrypted PDFs in this tool using your set password credentials.',
      category: 'Security',
      icon: <Unlock className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'edit', 
      name: 'Edit PDF', 
      desc: 'Add text annotations, custom shape stamps, and highlights directly into your PDF.',
      category: 'Security',
      icon: <Edit3 className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'compare', 
      name: 'Compare PDF', 
      desc: 'Upload two PDF documents side-by-side and highlight structural differences.',
      category: 'Security',
      icon: <ArrowLeftRight className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'scan', 
      name: 'Scan to PDF', 
      desc: 'Capture documents using your web-camera, crop, compile and download as PDF.',
      category: 'Security',
      icon: <Camera className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'ocr', 
      name: 'OCR PDF', 
      desc: 'Recognize text inside scanned PDFs and export searchable text nodes.',
      category: 'Security',
      icon: <FileSearch className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'forms', 
      name: 'Fill PDF Forms', 
      desc: 'Instantly fill out form text field values and download standard PDF documents.',
      category: 'Security',
      icon: <Edit3 className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'redact', 
      name: 'Redact PDF', 
      desc: 'Overlay secure black mask blocks on confidential coordinates to hide text patterns.',
      category: 'Security',
      icon: <Eye className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'flatten-pdf', 
      name: 'Flatten PDF', 
      desc: 'Permanently merge annotations, comments, and form fields into the page content.',
      category: 'Security',
      icon: <Layers className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'permissions', 
      name: 'Set Permissions', 
      desc: 'Restrict printing, copying, or editing of your PDF document.',
      category: 'Security',
      icon: <Lock className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'redact-by-search', 
      name: 'Redact by Search', 
      desc: 'Search for specific text across your PDF and redact all occurrences.',
      category: 'Security',
      icon: <ShieldAlert className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'form-extract', 
      name: 'Extract Form Data', 
      desc: 'Export filled PDF form field data to JSON format.',
      category: 'Security',
      icon: <FileSearch className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'validate-pdfua', 
      name: 'PDF/UA Validator', 
      desc: 'Check your PDF document for PDF/UA accessibility compliance.',
      category: 'Security',
      icon: <ShieldAlert className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'ai-summarizer', 
      name: 'AI Summarizer', 
      desc: 'Generate key outline summaries and markdown notes client-side natively from PDF text.',
      category: 'Security',
      icon: <Sparkles className="w-8 h-8 text-red-500" />
    },
    { 
      id: 'translate', 
      name: 'Translate PDF', 
      desc: 'Extract and translate English text documents to multilingual outline segments.',
      category: 'Security',
      icon: <ArrowLeftRight className="w-8 h-8 text-red-500" />
    }
  ];

  const handleSelectTool = (id: string, name: string) => {
    setUserSelectedTool(id);
    setUserSelectedToolName(name);
  };

  const handleBackToDashboard = () => {
    setUserSelectedTool(null);
    setUserSelectedToolName('');
    // Clear the query param so back navigation works cleanly
    router.push('/');
  };

  return (
    <div className={`flex flex-col flex-1 bg-slate-50 text-slate-800 font-sans select-none relative overflow-x-hidden ${
      activeTool ? 'h-screen overflow-hidden' : 'min-h-screen'
    }`}>
      {activeTool ? (
        <PdfWorkspace 
          toolId={activeTool}
          toolName={activeToolName}
          onBack={handleBackToDashboard}
        />
      ) : (
        <>
          {/* Subtle Background Radial Gradients */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.06),transparent_60%)] pointer-events-none -z-10" />

          {/* Hero Headline Section */}
          <section className="py-12 px-6 text-center max-w-3xl mx-auto shrink-0 animate-fade-in">
            <h1 className="text-3.5xl font-black text-slate-900 tracking-tight leading-tight animate-slide-up">
              Every tool you need to work with PDFs in one place
            </h1>
            <p className="mt-3 text-sm text-slate-500 max-w-xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '150ms', opacity: 0, animationFillMode: 'forwards' }}>
              Every tool is <strong>100% free</strong> and easy to use. Merge, split, compress, convert, rotate, protect, and sign PDFs in just a few clicks.
            </p>
          </section>

          {/* Tools Dashboard Grid */}
          <main className="flex-1 overflow-y-auto px-8 pb-16 max-w-6xl mx-auto w-full animate-fade-in">
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-8 animate-fade-in" style={{ animationDelay: '100ms', opacity: 0, animationFillMode: 'forwards' }}>
              {(['All', 'Organize', 'Convert', 'Optimize', 'Security'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs font-bold px-4 py-2.5 rounded-full transition-all duration-200 cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-red-600 text-white shadow-md shadow-red-600/15'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 hover:shadow-sm'
                  }`}
                >
                  {cat === 'All' ? 'All Tools' : cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {tools
                .filter(t => selectedCategory === 'All' || t.category === selectedCategory)
                .map((tool, idx) => (
                  <div
                    key={tool.id}
                    onClick={() => handleSelectTool(tool.id, tool.name)}
                    className={`bg-white border rounded-2xl p-6 shadow-sm cursor-pointer flex flex-col justify-between h-full min-h-[210px] relative group tool-card animate-slide-up ${
                      tool.category === 'Organize' ? 'hover:border-blue-500/40 hover:shadow-blue-500/5' :
                      tool.category === 'Convert' ? 'hover:border-purple-500/40 hover:shadow-purple-500/5' :
                      tool.category === 'Optimize' ? 'hover:border-amber-500/40 hover:shadow-amber-500/5' :
                      'hover:border-rose-500/40 hover:shadow-rose-500/5'
                    }`}
                    style={{ animationDelay: `${idx * 25}ms`, opacity: 0, animationFillMode: 'forwards' }}
                  >
                    <div>
                      {/* Header: Icon + Category Badge */}
                      <div className="flex items-start justify-between">
                        <div className={`rounded-2xl p-3.5 border transition-all duration-300 ${
                          tool.category === 'Organize' ? 'bg-blue-50/80 border-blue-100 group-hover:bg-blue-600 group-hover:border-blue-600' :
                          tool.category === 'Convert' ? 'bg-purple-50/80 border-purple-100 group-hover:bg-purple-600 group-hover:border-purple-600' :
                          tool.category === 'Optimize' ? 'bg-amber-50/80 border-amber-100 group-hover:bg-amber-600 group-hover:border-amber-600' :
                          'bg-red-50/80 border-red-100 group-hover:bg-red-600 group-hover:border-red-600'
                        }`}>
                          {React.cloneElement(tool.icon as React.ReactElement<{ className?: string }>, {
                            className: `w-6 h-6 transition-all duration-300 ${
                              tool.category === 'Organize' ? 'text-blue-600 group-hover:text-white' :
                              tool.category === 'Convert' ? 'text-purple-600 group-hover:text-white' :
                              tool.category === 'Optimize' ? 'text-amber-600 group-hover:text-white' :
                              'text-red-600 group-hover:text-white'
                            }`
                          })}
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          tool.category === 'Organize' ? 'bg-blue-50 text-blue-600 border-blue-100/50' :
                          tool.category === 'Convert' ? 'bg-purple-50 text-purple-600 border-purple-100/50' :
                          tool.category === 'Optimize' ? 'bg-amber-50 text-amber-600 border-amber-100/50' :
                          'bg-rose-50 text-rose-600 border-rose-100/50'
                        }`}>
                          {tool.category}
                        </span>
                      </div>

                      {/* Tool details */}
                      <h3 className={`font-extrabold text-slate-900 text-base mt-4 transition-colors ${
                        tool.category === 'Organize' ? 'group-hover:text-blue-600' :
                        tool.category === 'Convert' ? 'group-hover:text-purple-600' :
                        tool.category === 'Optimize' ? 'group-hover:text-amber-600' :
                        'group-hover:text-red-600'
                      }`}>
                        {tool.name}
                      </h3>
                      <p className="mt-1.5 text-xs text-slate-500 leading-relaxed line-clamp-3">
                        {tool.desc}
                      </p>
                    </div>

                    {/* Hover indicator link arrow */}
                    <div className={`mt-4 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity ${
                      tool.category === 'Organize' ? 'text-blue-600' :
                      tool.category === 'Convert' ? 'text-purple-600' :
                      tool.category === 'Optimize' ? 'text-amber-600' :
                      'text-red-600'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider mr-1.5">Open tool</span>
                      <ChevronRight className="w-4 h-4 translate-x-[-4px] group-hover:translate-x-0 transition-transform" />
                    </div>
                  </div>
                ))}
            </div>
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-slate-200 text-slate-600 shrink-0">
            <div className="max-w-6xl mx-auto px-8 py-12">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="col-span-2 md:col-span-1">
                  <Link href="/" className="inline-block select-none">
                    <Image 
                      src="/logo-footer.png" 
                      alt="Docify Logo" 
                      width={220} 
                      height={72} 
                      className="h-16 w-auto object-contain origin-left scale-125"
                    />
                  </Link>
                  <p className="mt-3 text-xs text-slate-500 leading-relaxed max-w-xs">
                    Every tool you need to work with PDFs. 100% free, client-side processing with no file uploads.
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Tools</h4>
                  <ul className="space-y-2">
                    {['Merge PDF', 'Split PDF', 'Compress PDF', 'Rotate PDF'].map(t => (
                      <li key={t}>
                        <button onClick={() => {
                          const tool = t.toLowerCase().replace(/\s/g, '-');
                          const map: Record<string, string> = { 'merge-pdf': 'merge', 'split-pdf': 'split', 'compress-pdf': 'compress', 'rotate-pdf': 'rotate' };
                          const slug = map[tool] || tool;
                          window.location.href = `/?tool=${slug}`;
                        }} className="text-xs text-slate-500 hover:text-red-600 transition-colors">{t}</button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Convert</h4>
                  <ul className="space-y-2">
                    {['JPG to PDF', 'Word to PDF', 'HTML to PDF', 'PDF to JPG'].map(t => (
                      <li key={t}>
                        <button onClick={() => {
                          const slug = t.toLowerCase().replace(/\s+/g, '-').replace('jpg', 'jpg');
                          window.location.href = `/?tool=${slug}`;
                        }} className="text-xs text-slate-500 hover:text-red-600 transition-colors">{t}</button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Security</h4>
                  <ul className="space-y-2">
                    {['Protect PDF', 'Unlock PDF', 'Sign PDF', 'Redact PDF'].map(t => (
                      <li key={t}>
                        <button onClick={() => window.location.href = `/?page=${t.toLowerCase().replace(/\s/g, '-')}`} className="text-xs text-slate-500 hover:text-red-600 transition-colors">{t}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[10px] text-slate-500">
                  All PDF modifications executed locally via pdf-lib. No files uploaded to any server.
                </p>

                <p className="text-[10px] text-slate-400">Made By Shreeharsh</p>
              </div>
            </div>
          </footer>
        </>
      )}

      <AuthModal 
        key={authMode}
        isOpen={authMode !== null} 
        initialMode={authMode || 'login'} 
        onClose={() => setUserClickedAuth(null)} 
        onSuccess={(email) => {
          localStorage.setItem('docify_user_email', email);
        }} 
      />
    </div>
  );
}

// Exported page: wraps HomeInner in Suspense (required by Next.js for useSearchParams)
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
