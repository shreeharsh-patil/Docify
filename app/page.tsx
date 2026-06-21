'use client';

import React, { useState, useEffect } from 'react';
import PdfWorkspace from '@/components/PdfWorkspace';
import AuthModal from '@/components/AuthModal';
import { 
  FileText, Sliders, Type, Lock, Unlock, Edit, 
  Image, RotateCw, Split, Layers, FolderClosed, 
  HelpCircle, Heart, HeartCrack, Sparkles, ChevronRight, FileUp,
  Camera, Printer, Table, Presentation, Grid, Scissors,
  Edit3, ShieldAlert, Eye, Settings, FileSearch, ArrowLeftRight, Activity,
  User, LogOut
} from 'lucide-react';

interface PdfTool {
  id: string;
  name: string;
  desc: string;
  category: 'Organize' | 'Convert' | 'Optimize' | 'Security';
  icon: React.ReactNode;
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('docify_user_email');
    if (saved) {
      setUserEmail(saved);
    }
  }, []);

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

    // 2. Convert to PDF
    { 
      id: 'jpg-to-pdf', 
      name: 'JPG to PDF', 
      desc: 'Convert images (JPG, PNG) to PDF in seconds. Easily adjust orientation, sizing, and margins.',
      category: 'Convert',
      icon: <Image className="w-8 h-8 text-red-500" />
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

    // 3. Convert from PDF
    { 
      id: 'pdf-to-jpg', 
      name: 'PDF to JPG', 
      desc: 'Extract all images contained within a PDF or convert each page to a JPG image.',
      category: 'Convert',
      icon: <Image className="w-8 h-8 text-red-500" />
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
    }
  ];

  const handleSelectTool = (id: string, name: string) => {
    setActiveTool(id);
    setActiveToolName(name);
  };

  const handleBackToDashboard = () => {
    setActiveTool(null);
    setActiveToolName('');
  };

  return (
    <div className={`flex flex-col flex-1 bg-slate-50 text-slate-800 font-sans select-none ${
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
          {/* Header Dashboard Nav */}
          <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-50">
            <div className="flex items-center gap-6">
              {/* Docify Logo */}
              <div className="flex items-center gap-1.5 cursor-pointer">
                <FileText className="w-6 h-6 text-red-600" />
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  Doc<span className="text-red-600">ify</span>
                </span>
              </div>

              {/* Sub Navigation Menus */}
              <nav className="hidden lg:flex items-center gap-5 text-xs font-bold text-slate-600 uppercase tracking-wide">
                <button onClick={() => handleSelectTool('merge', 'Merge PDF')} className="hover:text-red-600 transition-colors">Merge PDF</button>
                <button onClick={() => handleSelectTool('split', 'Split PDF')} className="hover:text-red-600 transition-colors">Split PDF</button>
                <button onClick={() => handleSelectTool('organize', 'Organize PDF')} className="hover:text-red-600 transition-colors">Organize PDF</button>
                <button onClick={() => handleSelectTool('jpg-to-pdf', 'JPG to PDF')} className="hover:text-red-600 transition-colors">JPG to PDF</button>
              </nav>
            </div>

            {/* Premium CTA banner */}
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-mono hidden md:inline">
                🔒 Client-Side Operations Enabled
              </span>
              
              {userEmail ? (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 pl-3 pr-1 py-1 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center border border-red-100">
                      <User className="w-4 h-4 text-red-600" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 hidden sm:inline-block max-w-[120px] truncate">
                      {userEmail}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setUserEmail(null);
                      localStorage.removeItem('docify_user_email');
                    }}
                    className="text-slate-400 hover:text-red-650 hover:bg-slate-100/50 p-2 rounded-xl transition-all flex items-center justify-center"
                    title="Log Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setAuthMode('login')}
                    className="text-slate-700 hover:text-red-600 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all duration-200"
                  >
                    Log In
                  </button>
                  <button 
                    onClick={() => setAuthMode('signup')}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4.5 py-2.5 rounded-xl shadow-md shadow-red-600/10 transition-colors flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Hero Headline Section */}
          <section className="py-12 px-6 text-center max-w-3xl mx-auto shrink-0">
            <h1 className="text-3.5xl font-black text-slate-900 tracking-tight leading-tight">
              Every tool you need to work with PDFs in one place
            </h1>
            <p className="mt-3 text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              Every tool is <strong>100% free</strong> and easy to use. Merge, split, compress, convert, rotate, protect, and sign PDFs in just a few clicks.
            </p>
          </section>

          {/* Tools Dashboard Grid */}
          <main className="flex-1 overflow-y-auto px-8 pb-16 max-w-6xl mx-auto w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {tools.map(tool => (
                <div
                  key={tool.id}
                  onClick={() => handleSelectTool(tool.id, tool.name)}
                  className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-red-500/50 cursor-pointer transition-all duration-300 flex flex-col justify-between h-[210px] relative group"
                >
                  <div>
                    {/* Header: Icon + Category Badge */}
                    <div className="flex items-start justify-between">
                      <div className="rounded-2xl bg-red-50 p-3.5 border border-red-100/50 group-hover:bg-red-600 group-hover:border-red-600 transition-all duration-300">
                        {React.cloneElement(tool.icon as React.ReactElement<any>, {
                          className: 'w-6 h-6 text-red-600 group-hover:text-white transition-all duration-300'
                        } as any)}
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        {tool.category}
                      </span>
                    </div>

                    {/* Tool details */}
                    <h3 className="font-extrabold text-slate-900 text-base mt-4 group-hover:text-red-600 transition-colors">
                      {tool.name}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed line-clamp-3">
                      {tool.desc}
                    </p>
                  </div>

                  {/* Hover indicator link arrow */}
                  <div className="mt-4 flex items-center justify-end text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold uppercase tracking-wider mr-1.5">Open tool</span>
                    <ChevronRight className="w-4 h-4 translate-x-[-4px] group-hover:translate-x-0 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </main>

          {/* Footer Info Menu */}
          <footer className="py-6 border-t border-slate-200 bg-white text-center text-xs text-slate-400 shrink-0">
            <p className="flex items-center justify-center gap-1.5 font-medium">
              Made with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> for secure document workflows. Docify PDF Suite.
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              All PDF modifications are executed locally via pdf-lib. No files are uploaded to any external server.
            </p>
          </footer>
        </>
      )}

      <AuthModal 
        isOpen={authMode !== null} 
        initialMode={authMode || 'login'} 
        onClose={() => setAuthMode(null)} 
        onSuccess={(email) => {
          setUserEmail(email);
          localStorage.setItem('docify_user_email', email);
        }} 
      />
    </div>
  );
}
