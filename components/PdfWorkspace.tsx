'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Upload, Trash2, ArrowLeft, Download, RotateCw, 
  ShieldAlert, Sparkles, CheckCircle, RefreshCw,
  Plus, Camera, Type, Square, Circle, ArrowRight, Stamp, Ruler,
  PenTool, Highlighter, Undo, Copy, ArrowUpDown, Shield, ShieldCheck,
  Check, Sliders, Layers, EyeOff, Search
} from 'lucide-react';
import { 
  fileToArrayBuffer, fileToDataUrl, mergePdfs, splitPdf, 
  rotatePdf, organizePdf, watermarkPdf, encryptPdfBuffer, 
  decryptPdfBuffer, signPdf, imagesToPdf, addPageNumbers, 
  compressPdf, repairPdf, htmlToPdf, removePages, extractPages,
  pdfToPdfa, cropPdf, fillPdfForms, redactPdf,
  extractTextFromOfficeFile, flattenPdf, addHeaderFooter, addBlankPages,
  txtToPdf, pdfToHtml, setPermissions, removeMetadata,
  redactByTextSearch, reversePages, nUpLayout, batesNumbering,
  extractFormData, validatePdfuaCompliance, pdfToMarkdownNative, pdfToDocxNative,
  pdfToXlsxNative, pdfToPptxNative,
  applyVisualAnnotationsToPdf, VisualAnnotation, organizePdfAdvanced, PageOrganizeItem,
  deepSanitizePdf, inspectPdfDetails, PdfInspectionReport, sanitizeForPdfFont
} from '@/lib/pdfProcessor';
import { processViaILovePDF } from '@/lib/ilovepdf-client';
import { processWithAI } from '@/lib/ai-client';
import { extractTextFromPdf, pdfToZipOfJpgs, getPdfPageInfos } from '@/lib/pdf-client';
import confetti from 'canvas-confetti';

interface PdfWorkspaceProps {
  toolId: string;
  toolName: string;
  onBack: () => void;
  onSwitchTool?: (toolId: string, toolName: string, carriedFiles?: File[]) => void;
  initialFiles?: File[];
}

export default function PdfWorkspace({ toolId, toolName, onBack, onSwitchTool, initialFiles }: PdfWorkspaceProps) {
  const [files, setFiles] = useState<File[]>(initialFiles || []);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync initialFiles if prop updates
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setFiles(initialFiles);
      setIsSuccess(false);
      setResultBlobUrl(null);
    }
  }, [initialFiles]);

  // Tool options states
  const [splitStart, setSplitStart] = useState(1);
  const [splitEnd, setSplitEnd] = useState(2);
  
  const [rotationAngle, setRotationAngle] = useState(90);
  
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkColor, setWatermarkColor] = useState('#ff0000');
  const [watermarkSize, setWatermarkSize] = useState(36);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.4);
  const [watermarkPos, setWatermarkPos] = useState<'center' | 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right'>('center');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [imgPageSize, setImgPageSize] = useState<'a4' | 'letter'>('a4');
  const [imgOrientation, setImgOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [imgMargin, setImgMargin] = useState(20);

  // Organize PDF page sequence indices & rotation state (KillerPDF matrix)
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [pageItems, setPageItems] = useState<{ id: string; originalIndex: number; rotation: number }[]>([]);
  const [totalPageCount, setTotalPageCount] = useState(0);

  // Sign PDF Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signPageNum, setSignPageNum] = useState(1);
  const [signX, setSignX] = useState(50);
  const [signY, setSignY] = useState(50);
  const [signW, setSignW] = useState(150);
  const [signH] = useState(60);

  // Page Numbers State
  const [pageNumberPos, setPageNumberPos] = useState<'bottom-center' | 'bottom-right' | 'top-center'>('bottom-center');

  // HTML to PDF State
  const [htmlCode, setHtmlCode] = useState('<h1>Hello Docify</h1>\n<p>This is a custom compiled client-side PDF document.</p>');

  // Visual Vector Annotation Studio (Open PDF Studio Engine)
  const [editToolType, setEditToolType] = useState<'text' | 'rect' | 'circle' | 'line' | 'arrow' | 'freehand' | 'highlighter' | 'stamp' | 'measurement'>('text');
  const [editText, setEditText] = useState('ANNOTATION TEXT');
  const [editX, setEditX] = useState(100);
  const [editY, setEditY] = useState(100);
  const [editColor, setEditColor] = useState('#ef4444');
  const [editFillColor, setEditFillColor] = useState('');
  const [editStrokeWidth, setEditStrokeWidth] = useState(2);
  const [editOpacity, setEditOpacity] = useState(1);
  const [editSize, setEditSize] = useState(14);
  const [editPageNum, setEditPageNum] = useState(1);
  const [editStampType, setEditStampType] = useState<'APPROVED' | 'REJECTED' | 'CONFIDENTIAL' | 'DRAFT' | 'PAID' | 'REVIEWED' | 'FINAL' | 'CUSTOM'>('APPROVED');
  const [customStampText, setCustomStampText] = useState('APPROVED');
  const [editScaleRatio, setEditScaleRatio] = useState(0.3528);
  const [editUnit, setEditUnit] = useState('mm');
  const [visualAnnotations, setVisualAnnotations] = useState<VisualAnnotation[]>([]);
  const [isDrawingShape, setIsDrawingShape] = useState(false);
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrentPoint, setDrawCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([]);
  const editPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const editPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const EDIT_PREVIEW_SCALE = 1.2;

  // Scan to PDF State
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // New features options states
  const [pagesToRemove, setPagesToRemove] = useState('2');
  const [pagesToExtract, setPagesToExtract] = useState('1,3');
  const [pdfaStandard, setPdfaStandard] = useState('PDF/A-1b');
  const [cropPercent, setCropPercent] = useState(15);
  const [redactText, setRedactText] = useState('CONFIDENTIAL');
  const [formName, setFormName] = useState('John Doe');
  const [formEmail, setFormEmail] = useState('john.doe@email.com');
  const [formNotes, setFormNotes] = useState('Filled client-side using Docify Forms Suite.');
  const [summaryLength, setSummaryLength] = useState<'brief' | 'detailed'>('brief');
  const [translateLang, setTranslateLang] = useState('Spanish');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [hfHeaderText, setHfHeaderText] = useState('');
  const [hfFooterText, setHfFooterText] = useState('');
  const [blankPositions, setBlankPositions] = useState('end');
  const [blankCount, setBlankCount] = useState(1);
  const [blankCustomPos, setBlankCustomPos] = useState('1,3,5');

  // New tool options states
  const [txtContent, setTxtContent] = useState('Enter your text here...\n\nYou can write multiple paragraphs.\n\nDocify will automatically convert this to a properly formatted PDF document.');
  const [txtPageSize, setTxtPageSize] = useState<'a4' | 'letter'>('a4');
  const txtMargin = 40;
  const [pngPageNum, setPngPageNum] = useState(1);
  const [pngScale, setPngScale] = useState(2);
  const [batesStart, setBatesStart] = useState(1);
  const [batesPrefix, setBatesPrefix] = useState('');
  const [batesSuffix, setBatesSuffix] = useState('');
  const [nUpCount, setNUpCount] = useState<2 | 4 | 6>(2);
  const [permPrinting, setPermPrinting] = useState<'none' | 'lowRes' | 'highRes'>('highRes');
  const [permChanging, setPermChanging] = useState<'none' | 'insertDelete' | 'fillSign' | 'anyExceptExtract'>('anyExceptExtract');
  const [permCopying, setPermCopying] = useState(true);
  const [redactSearchText, setRedactSearchText] = useState('CONFIDENTIAL');
  const [pdfuaResult, setPdfuaResult] = useState<{ passed: boolean; issues: string[] } | null>(null);

  // Initialize Organize indexes and Edit states when a file is uploaded
  useEffect(() => {
    if (files.length === 1 && (toolId === 'organize' || toolId === 'sign' || toolId === 'edit')) {
      const getPageCount = async () => {
        try {
          const buffer = await fileToArrayBuffer(files[0]);
          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.load(buffer);
          const count = pdfDoc.getPageCount();
          setTotalPageCount(count);
          setPageOrder(Array.from({ length: count }, (_, i) => i));
          setPageItems(Array.from({ length: count }, (_, i) => ({ id: `p-${i}-${Date.now()}`, originalIndex: i, rotation: 0 })));
          if (toolId === 'edit') {
            setVisualAnnotations([]);
            setEditPageNum(1);
          }
        } catch (e) {
          console.error(e);
        }
      };
      getPageCount();
    }
  }, [files, toolId]);

  // Render a live interactive vector canvas for Edit PDF (Open PDF Studio Engine)
  useEffect(() => {
    if (toolId !== 'edit' || files.length !== 1) return;
    let cancelled = false;

    (async () => {
      try {
        const buffer = await fileToArrayBuffer(files[0]);
        const { renderPdfPageToCanvas } = await import('@/lib/pdf-client');
        const pageNum = Math.min(Math.max(1, editPageNum), totalPageCount || editPageNum);
        const canvas = await renderPdfPageToCanvas(buffer, pageNum, EDIT_PREVIEW_SCALE);
        if (cancelled) return;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw committed annotations for this page
          visualAnnotations
            .filter((a) => a.page === pageNum)
            .forEach((a) => {
              const primaryColor = a.color || '#ef4444';
              const strokeWidth = (a.strokeWidth || 2) * EDIT_PREVIEW_SCALE;
              const opacity = a.opacity ?? 1;
              ctx.save();
              ctx.globalAlpha = opacity;

              switch (a.type) {
                case 'text': {
                  const cx = a.x * EDIT_PREVIEW_SCALE;
                  const cy = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  ctx.fillStyle = primaryColor;
                  ctx.font = `bold ${(a.fontSize || 14) * EDIT_PREVIEW_SCALE}px sans-serif`;
                  ctx.fillText(a.text || '', cx, cy);
                  break;
                }
                case 'highlighter': {
                  const cx = a.x * EDIT_PREVIEW_SCALE;
                  const cy = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  const cw = (a.width || 120) * EDIT_PREVIEW_SCALE;
                  const ch = (a.height || 24) * EDIT_PREVIEW_SCALE;
                  ctx.fillStyle = primaryColor;
                  ctx.globalAlpha = 0.35;
                  ctx.fillRect(cx, cy, cw, ch);
                  break;
                }
                case 'rect': {
                  const cx = a.x * EDIT_PREVIEW_SCALE;
                  const cy = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  const cw = (a.width || 100) * EDIT_PREVIEW_SCALE;
                  const ch = (a.height || 60) * EDIT_PREVIEW_SCALE;
                  if (a.fillColor) {
                    ctx.fillStyle = a.fillColor;
                    ctx.fillRect(cx, cy, cw, ch);
                  }
                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = strokeWidth;
                  ctx.strokeRect(cx, cy, cw, ch);
                  break;
                }
                case 'circle': {
                  const cx = a.x * EDIT_PREVIEW_SCALE;
                  const cy = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  const rx = ((a.width || 80) * EDIT_PREVIEW_SCALE) / 2;
                  const ry = ((a.height || 80) * EDIT_PREVIEW_SCALE) / 2;
                  ctx.beginPath();
                  ctx.ellipse(cx + rx, cy + ry, rx, ry, 0, 0, Math.PI * 2);
                  if (a.fillColor) {
                    ctx.fillStyle = a.fillColor;
                    ctx.fill();
                  }
                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = strokeWidth;
                  ctx.stroke();
                  break;
                }
                case 'line':
                case 'arrow': {
                  const x1 = a.x * EDIT_PREVIEW_SCALE;
                  const y1 = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  const x2 = (a.x2 ?? a.x + (a.width || 100)) * EDIT_PREVIEW_SCALE;
                  const y2 = canvas.height - (a.y2 ?? a.y) * EDIT_PREVIEW_SCALE;
                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = strokeWidth;
                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.stroke();

                  if (a.type === 'arrow') {
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    const headLen = Math.max(10, strokeWidth * 3.5);
                    const arrowAngle = Math.PI / 6;
                    ctx.beginPath();
                    ctx.moveTo(x2, y2);
                    ctx.lineTo(x2 - headLen * Math.cos(angle - arrowAngle), y2 - headLen * Math.sin(angle - arrowAngle));
                    ctx.moveTo(x2, y2);
                    ctx.lineTo(x2 - headLen * Math.cos(angle + arrowAngle), y2 - headLen * Math.sin(angle + arrowAngle));
                    ctx.stroke();
                  }
                  break;
                }
                case 'freehand': {
                  if (a.points && a.points.length > 1) {
                    ctx.strokeStyle = primaryColor;
                    ctx.lineWidth = strokeWidth;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    const p0 = a.points[0];
                    ctx.moveTo(p0.x * EDIT_PREVIEW_SCALE, canvas.height - p0.y * EDIT_PREVIEW_SCALE);
                    for (let i = 1; i < a.points.length; i++) {
                      const p = a.points[i];
                      ctx.lineTo(p.x * EDIT_PREVIEW_SCALE, canvas.height - p.y * EDIT_PREVIEW_SCALE);
                    }
                    ctx.stroke();
                  }
                  break;
                }
                case 'stamp': {
                  const stampText = (a.customStampText || a.stampType || 'APPROVED').toUpperCase();
                  const cx = a.x * EDIT_PREVIEW_SCALE;
                  const cy = canvas.height - a.y * EDIT_PREVIEW_SCALE - 44 * EDIT_PREVIEW_SCALE;
                  const sw = Math.max(130, stampText.length * 11 + 24) * EDIT_PREVIEW_SCALE;
                  const sh = 40 * EDIT_PREVIEW_SCALE;

                  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                  ctx.fillRect(cx, cy, sw, sh);
                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = 2.5 * EDIT_PREVIEW_SCALE;
                  ctx.strokeRect(cx, cy, sw, sh);
                  ctx.lineWidth = 1 * EDIT_PREVIEW_SCALE;
                  ctx.strokeRect(cx + 3, cy + 3, sw - 6, sh - 6);

                  ctx.fillStyle = primaryColor;
                  ctx.font = `bold ${13 * EDIT_PREVIEW_SCALE}px sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(stampText, cx + sw / 2, cy + sh / 2);
                  ctx.textAlign = 'start';
                  ctx.textBaseline = 'alphabetic';
                  break;
                }
                case 'measurement': {
                  const x1 = a.x * EDIT_PREVIEW_SCALE;
                  const y1 = canvas.height - a.y * EDIT_PREVIEW_SCALE;
                  const x2 = (a.x2 ?? a.x + (a.width || 120)) * EDIT_PREVIEW_SCALE;
                  const y2 = canvas.height - (a.y2 ?? a.y) * EDIT_PREVIEW_SCALE;
                  const distPx = Math.hypot((a.x2 ?? a.x + 120) - a.x, (a.y2 ?? a.y) - a.y);
                  const ratio = a.scaleRatio || 0.3528;
                  const unit = a.unit || 'mm';
                  const label = `${(distPx * ratio).toFixed(1)} ${unit}`;

                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = 1.5 * EDIT_PREVIEW_SCALE;
                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.stroke();

                  // Tick marks
                  const angle = Math.atan2(y2 - y1, x2 - x1);
                  const perp = angle + Math.PI / 2;
                  const tick = 6 * EDIT_PREVIEW_SCALE;
                  ctx.beginPath();
                  ctx.moveTo(x1 - tick * Math.cos(perp), y1 - tick * Math.sin(perp));
                  ctx.lineTo(x1 + tick * Math.cos(perp), y1 + tick * Math.sin(perp));
                  ctx.moveTo(x2 - tick * Math.cos(perp), y2 - tick * Math.sin(perp));
                  ctx.lineTo(x2 + tick * Math.cos(perp), y2 + tick * Math.sin(perp));
                  ctx.stroke();

                  // Badge
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  ctx.font = `bold ${10 * EDIT_PREVIEW_SCALE}px sans-serif`;
                  const tw = ctx.measureText(label).width;
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                  ctx.fillRect(mx - tw / 2 - 4, my - 8 * EDIT_PREVIEW_SCALE, tw + 8, 16 * EDIT_PREVIEW_SCALE);
                  ctx.strokeStyle = primaryColor;
                  ctx.lineWidth = 1;
                  ctx.strokeRect(mx - tw / 2 - 4, my - 8 * EDIT_PREVIEW_SCALE, tw + 8, 16 * EDIT_PREVIEW_SCALE);
                  ctx.fillStyle = primaryColor;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(label, mx, my);
                  ctx.textAlign = 'start';
                  ctx.textBaseline = 'alphabetic';
                  break;
                }
              }
              ctx.restore();
            });

          // Draw active in-progress shape
          if (isDrawingShape && drawStartPoint && drawCurrentPoint) {
            const x1 = drawStartPoint.x * EDIT_PREVIEW_SCALE;
            const y1 = canvas.height - drawStartPoint.y * EDIT_PREVIEW_SCALE;
            const x2 = drawCurrentPoint.x * EDIT_PREVIEW_SCALE;
            const y2 = canvas.height - drawCurrentPoint.y * EDIT_PREVIEW_SCALE;

            ctx.save();
            ctx.strokeStyle = editColor;
            ctx.lineWidth = editStrokeWidth * EDIT_PREVIEW_SCALE;

            if (editToolType === 'rect' || editToolType === 'highlighter') {
              const rx = Math.min(x1, x2);
              const ry = Math.min(y1, y2);
              const rw = Math.abs(x2 - x1);
              const rh = Math.abs(y2 - y1);
              if (editToolType === 'highlighter') {
                ctx.fillStyle = editColor;
                ctx.globalAlpha = 0.35;
                ctx.fillRect(rx, ry, rw, rh);
              } else {
                if (editFillColor) {
                  ctx.fillStyle = editFillColor;
                  ctx.fillRect(rx, ry, rw, rh);
                }
                ctx.strokeRect(rx, ry, rw, rh);
              }
            } else if (editToolType === 'circle') {
              const rx = Math.abs(x2 - x1) / 2;
              const ry = Math.abs(y2 - y1) / 2;
              const cx = Math.min(x1, x2) + rx;
              const cy = Math.min(y1, y2) + ry;
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              if (editFillColor) {
                ctx.fillStyle = editFillColor;
                ctx.fill();
              }
              ctx.stroke();
            } else if (editToolType === 'line' || editToolType === 'arrow' || editToolType === 'measurement') {
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            } else if (editToolType === 'freehand' && freehandPoints.length > 1) {
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.beginPath();
              const p0 = freehandPoints[0];
              ctx.moveTo(p0.x * EDIT_PREVIEW_SCALE, canvas.height - p0.y * EDIT_PREVIEW_SCALE);
              for (let i = 1; i < freehandPoints.length; i++) {
                const p = freehandPoints[i];
                ctx.lineTo(p.x * EDIT_PREVIEW_SCALE, canvas.height - p.y * EDIT_PREVIEW_SCALE);
              }
              ctx.stroke();
            }
            ctx.restore();
          }
        }

        editPreviewCanvasRef.current = canvas;
        if (editPreviewContainerRef.current) {
          editPreviewContainerRef.current.innerHTML = '';
          canvas.className = 'max-w-full h-auto rounded-xl border border-slate-300 shadow-md cursor-crosshair select-none touch-none';
          editPreviewContainerRef.current.appendChild(canvas);
        }
      } catch (e) {
        console.error('Edit preview render failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    files, toolId, editPageNum, totalPageCount, visualAnnotations,
    isDrawingShape, drawStartPoint, drawCurrentPoint, freehandPoints,
    editColor, editStrokeWidth, editFillColor, editToolType, editOpacity
  ]);

  // Pointer event helpers for interactive drawing canvas
  const getPdfCoordinatesFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = editPreviewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const pdfX = Math.round(canvasX / EDIT_PREVIEW_SCALE);
    const pdfY = Math.round((canvas.height - canvasY) / EDIT_PREVIEW_SCALE);
    return { pdfX, pdfY };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const coords = getPdfCoordinatesFromEvent(e);
    if (!coords) return;
    const { pdfX, pdfY } = coords;

    setEditX(pdfX);
    setEditY(pdfY);

    if (editToolType === 'text') {
      const newAnn: VisualAnnotation = {
        id: `txt-${Date.now()}`,
        type: 'text',
        page: editPageNum,
        x: pdfX,
        y: pdfY,
        text: editText || 'Sample Note',
        fontSize: editSize,
        color: editColor,
        opacity: editOpacity,
      };
      setVisualAnnotations((prev) => [...prev, newAnn]);
      return;
    }

    if (editToolType === 'stamp') {
      const newAnn: VisualAnnotation = {
        id: `stamp-${Date.now()}`,
        type: 'stamp',
        page: editPageNum,
        x: pdfX,
        y: pdfY,
        stampType: editStampType,
        customStampText: editStampType === 'CUSTOM' ? customStampText : undefined,
        color: editColor,
        opacity: editOpacity,
      };
      setVisualAnnotations((prev) => [...prev, newAnn]);
      return;
    }

    if (editToolType === 'freehand') {
      setIsDrawingShape(true);
      setFreehandPoints([{ x: pdfX, y: pdfY }]);
      return;
    }

    // Shapes: rect, circle, line, arrow, highlighter, measurement
    setIsDrawingShape(true);
    setDrawStartPoint({ x: pdfX, y: pdfY });
    setDrawCurrentPoint({ x: pdfX, y: pdfY });
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingShape) return;
    const coords = getPdfCoordinatesFromEvent(e);
    if (!coords) return;
    const { pdfX, pdfY } = coords;

    if (editToolType === 'freehand') {
      setFreehandPoints((prev) => [...prev, { x: pdfX, y: pdfY }]);
    } else {
      setDrawCurrentPoint({ x: pdfX, y: pdfY });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingShape) return;
    const coords = getPdfCoordinatesFromEvent(e);
    const endX = coords ? coords.pdfX : (drawCurrentPoint?.x ?? editX);
    const endY = coords ? coords.pdfY : (drawCurrentPoint?.y ?? editY);

    if (editToolType === 'freehand' && freehandPoints.length > 1) {
      const newAnn: VisualAnnotation = {
        id: `free-${Date.now()}`,
        type: 'freehand',
        page: editPageNum,
        x: freehandPoints[0].x,
        y: freehandPoints[0].y,
        points: freehandPoints,
        color: editColor,
        strokeWidth: editStrokeWidth,
        opacity: editOpacity,
      };
      setVisualAnnotations((prev) => [...prev, newAnn]);
    } else if (drawStartPoint) {
      const startX = drawStartPoint.x;
      const startY = drawStartPoint.y;

      if (editToolType === 'rect' || editToolType === 'highlighter') {
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.max(10, Math.abs(endX - startX));
        const h = Math.max(10, Math.abs(endY - startY));
        const newAnn: VisualAnnotation = {
          id: `rect-${Date.now()}`,
          type: editToolType,
          page: editPageNum,
          x,
          y,
          width: w,
          height: h,
          color: editColor,
          fillColor: editFillColor || undefined,
          strokeWidth: editStrokeWidth,
          opacity: editToolType === 'highlighter' ? 0.35 : editOpacity,
        };
        setVisualAnnotations((prev) => [...prev, newAnn]);
      } else if (editToolType === 'circle') {
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const w = Math.max(10, Math.abs(endX - startX));
        const h = Math.max(10, Math.abs(endY - startY));
        const newAnn: VisualAnnotation = {
          id: `circle-${Date.now()}`,
          type: 'circle',
          page: editPageNum,
          x,
          y,
          width: w,
          height: h,
          color: editColor,
          fillColor: editFillColor || undefined,
          strokeWidth: editStrokeWidth,
          opacity: editOpacity,
        };
        setVisualAnnotations((prev) => [...prev, newAnn]);
      } else if (editToolType === 'line' || editToolType === 'arrow') {
        const newAnn: VisualAnnotation = {
          id: `line-${Date.now()}`,
          type: editToolType,
          page: editPageNum,
          x: startX,
          y: startY,
          x2: endX,
          y2: endY,
          color: editColor,
          strokeWidth: editStrokeWidth,
          opacity: editOpacity,
        };
        setVisualAnnotations((prev) => [...prev, newAnn]);
      } else if (editToolType === 'measurement') {
        const newAnn: VisualAnnotation = {
          id: `measure-${Date.now()}`,
          type: 'measurement',
          page: editPageNum,
          x: startX,
          y: startY,
          x2: endX,
          y2: endY,
          scaleRatio: editScaleRatio,
          unit: editUnit,
          color: editColor,
          strokeWidth: 1.5,
          opacity: editOpacity,
        };
        setVisualAnnotations((prev) => [...prev, newAnn]);
      }
    }

    setIsDrawingShape(false);
    setDrawStartPoint(null);
    setDrawCurrentPoint(null);
    setFreehandPoints([]);
  };

  const undoLastAnnotation = () => {
    setVisualAnnotations((prev) => prev.slice(0, -1));
  };

  const clearPageAnnotations = () => {
    setVisualAnnotations((prev) => prev.filter((a) => a.page !== editPageNum));
  };

  const removeVisualAnnotation = (id: string) => {
    setVisualAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  // KillerPDF Organize Studio matrix handlers
  const movePageItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= pageItems.length) return;
    const newItems = [...pageItems];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, moved);
    setPageItems(newItems);
  };

  const rotatePageItem = (index: number) => {
    setPageItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, rotation: (item.rotation + 90) % 360 } : item))
    );
  };

  const duplicatePageItem = (index: number) => {
    const item = pageItems[index];
    const newItem = { ...item, id: `p-dup-${Date.now()}` };
    const newItems = [...pageItems.slice(0, index + 1), newItem, ...pageItems.slice(index + 1)];
    setPageItems(newItems);
  };

  const deletePageItem = (index: number) => {
    if (pageItems.length <= 1) {
      setErrorMsg('You must have at least 1 page in the document.');
      return;
    }
    setPageItems((prev) => prev.filter((_, i) => i !== index));
  };

  const rotateAllPages = () => {
    setPageItems((prev) => prev.map((item) => ({ ...item, rotation: (item.rotation + 90) % 360 })));
  };

  const reverseAllPages = () => {
    setPageItems((prev) => [...prev].reverse());
  };

  const resetPageItems = () => {
    setPageItems(
      Array.from({ length: totalPageCount }, (_, i) => ({
        id: `p-${i}-${Date.now()}`,
        originalIndex: i,
        rotation: 0,
      }))
    );
  };

  // Handle Drag & Drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    validateAndAddFiles(droppedFiles);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
    }
  };

  const validateAndAddFiles = (newFiles: File[]) => {
    let allowedExtensions: string[] = [];
    let errorMsgText = 'Only PDF documents are supported.';

    if (toolId === 'jpg-to-pdf' || toolId === 'scan') {
      allowedExtensions = ['.jpg', '.jpeg', '.png'];
      errorMsgText = 'Only JPG and PNG images are supported.';
    } else if (toolId === 'word-to-pdf') {
      allowedExtensions = ['.doc', '.docx'];
      errorMsgText = 'Only Word documents (.doc, .docx) are supported.';
    } else if (toolId === 'excel-to-pdf') {
      allowedExtensions = ['.xls', '.xlsx', '.csv'];
      errorMsgText = 'Only Excel files (.xls, .xlsx, .csv) are supported.';
    } else if (toolId === 'ppt-to-pdf') {
      allowedExtensions = ['.ppt', '.pptx'];
      errorMsgText = 'Only PowerPoint files (.ppt, .pptx) are supported.';
    } else if (toolId === 'txt-to-pdf') {
      // No file needed, works with text input directly
      return;
    } else {
      allowedExtensions = ['.pdf'];
      errorMsgText = 'Only PDF documents are supported.';
    }

    const validFiles = newFiles.filter(file => {
      const name = file.name.toLowerCase();
      return allowedExtensions.some(ext => name.endsWith(ext));
    });

    if (validFiles.length === 0) {
      setErrorMsg(errorMsgText);
      return;
    }

    setErrorMsg(null);
    // Allow multi-file uploads for merge, image conversions, compare, and camera scans
    if (toolId === 'merge' || toolId === 'jpg-to-pdf' || toolId === 'scan' || toolId === 'compare') {
      setFiles(prev => [...prev, ...validFiles]);
    } else {
      setFiles([validFiles[0]]); // single file tools
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (files.length <= 1) {
      setPageOrder([]);
      setTotalPageCount(0);
    }
  };

  // Canvas Drawing for Sign PDF
  const startDrawing = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    // Calculate offsets based on client position relative to canvas
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    saveSignature();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignatureData(dataUrl);
  };

  // Scan to PDF functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setErrorMsg(null);
    } catch (err) {
      console.error(err);
      setErrorMsg('Webcam access was denied or is not supported on this device.');
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setCapturedImages(prev => [...prev, dataUrl]);
    confetti({
      particleCount: 15,
      spread: 20,
      colors: ['#ef4444', '#f87171']
    });
  };

  // Deactivate camera on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Execute PDF processing operations
  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      let outputBytes: Uint8Array;
      let newName = '';

      switch (toolId) {
        case 'merge': {
          const buffers = await Promise.all(files.map(fileToArrayBuffer));
          outputBytes = await mergePdfs(buffers);
          newName = 'merged_documents.pdf';
          break;
        }
        case 'split': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await splitPdf(buffer, splitStart, splitEnd);
          newName = `${files[0].name.replace('.pdf', '')}_split_${splitStart}-${splitEnd}.pdf`;
          break;
        }
        case 'rotate': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await rotatePdf(buffer, rotationAngle);
          newName = `${files[0].name.replace('.pdf', '')}_rotated.pdf`;
          break;
        }
        case 'organize': {
          if (pageItems.length === 0) {
            throw new Error('You must keep at least one page in your document.');
          }
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await organizePdfAdvanced(buffer, pageItems.map(p => ({ originalIndex: p.originalIndex, rotation: p.rotation })));
          newName = `${files[0].name.replace('.pdf', '')}_organized.pdf`;
          break;
        }
        case 'watermark': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await watermarkPdf(buffer, watermarkText, {
            color: watermarkColor,
            size: watermarkSize,
            opacity: watermarkOpacity,
            position: watermarkPos
          });
          newName = `${files[0].name.replace('.pdf', '')}_watermarked.pdf`;
          break;
        }
        case 'protect': {
          if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
          }
          if (!password) {
            throw new Error('Please enter a password.');
          }
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await encryptPdfBuffer(buffer, password);
          newName = `${files[0].name.replace('.pdf', '')}_protected.pdf`;
          break;
        }
        case 'unlock': {
          if (!password) {
            throw new Error('Please enter your decrypt password.');
          }
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await decryptPdfBuffer(buffer, password);
          newName = `${files[0].name.replace('.pdf', '')}_unlocked.pdf`;
          break;
        }
        case 'sign': {
          if (!signatureData) {
            throw new Error('Please draw your signature in the canvas first.');
          }
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await signPdf(buffer, signatureData, {
            pageNumber: signPageNum,
            x: signX,
            y: signY,
            width: signW,
            height: signH
          });
          newName = `${files[0].name.replace('.pdf', '')}_signed.pdf`;
          break;
        }
        case 'jpg-to-pdf': {
          const dataUrls = await Promise.all(files.map(fileToDataUrl));
          outputBytes = await imagesToPdf(dataUrls, {
            pageSize: imgPageSize,
            orientation: imgOrientation,
            margin: imgMargin
          });
          newName = 'images_converted.pdf';
          break;
        }
        case 'page-numbers': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await addPageNumbers(buffer, pageNumberPos);
          newName = `${files[0].name.replace('.pdf', '')}_numbered.pdf`;
          break;
        }
        case 'compress': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await compressPdf(buffer);
          newName = `${files[0].name.replace('.pdf', '')}_compressed.pdf`;
          break;
        }
        case 'repair': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await repairPdf(buffer);
          newName = `${files[0].name.replace('.pdf', '')}_repaired.pdf`;
          break;
        }
        case 'html-to-pdf': {
          outputBytes = await htmlToPdf(htmlCode, { pageSize: 'a4', margin: 40 });
          newName = 'html_compiled.pdf';
          break;
        }
        case 'word-to-pdf':
        case 'excel-to-pdf':
        case 'ppt-to-pdf': {
          // Prefer server-side conversion (real Office engine via iLovePDF) so
          // formatting, images, tables and layout are preserved. Only fall back
          // to the plain-text reconstruction below if the API is unavailable.
          try {
            const apiResult = await processViaILovePDF(toolId, files);
            outputBytes = new Uint8Array(await apiResult.blob.arrayBuffer());
            newName = apiResult.fileName;
            break;
          } catch {
            // fall through to client-side fallback
          }
          const extractedText = await extractTextFromOfficeFile(files[0]);
          const { PDFDocument, rgb: pdfRgb } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.create();
          const w = 595.27, h = 841.89;
          const margin = 50;
          let page = pdfDoc.addPage([w, h]);
          let currentY = h - margin;
          const size = 10;
          const lineHeight = 14;
          const maxWidth = w - margin * 2;
          page.drawText(`Converted: ${sanitizeForPdfFont(files[0].name)}`, { x: margin, y: currentY, size: 14, color: pdfRgb(0.2, 0.2, 0.2) });
          currentY -= 30;
          page.drawText(`Date: ${new Date().toLocaleString()}`, { x: margin, y: currentY, size: 9, color: pdfRgb(0.5, 0.5, 0.5) });
          currentY -= 20;
          page.drawLine({
            start: { x: margin, y: currentY },
            end: { x: w - margin, y: currentY },
            thickness: 1,
            color: pdfRgb(0.8, 0.8, 0.8),
          });
          currentY -= 20;

          const paragraphs = extractedText.split('\n');
          for (const para of paragraphs) {
            const cleanPara = sanitizeForPdfFont(para.trim());
            if (!cleanPara) {
              currentY -= lineHeight * 0.75;
              if (currentY < margin + 20) {
                page = pdfDoc.addPage([w, h]);
                currentY = h - margin;
              }
              continue;
            }

            const words = cleanPara.split(/\s+/);
            let line = '';
            for (const word of words) {
              const testLine = line ? `${line} ${word}` : word;
              if (testLine.length * (size * 0.55) > maxWidth && line) {
                page.drawText(line, { x: margin, y: currentY, size, color: pdfRgb(0.1, 0.1, 0.1) });
                currentY -= lineHeight;
                line = word;
                if (currentY < margin + 20) {
                  page = pdfDoc.addPage([w, h]);
                  currentY = h - margin;
                }
              } else {
                line = testLine;
              }
            }
            if (line) {
              page.drawText(line, { x: margin, y: currentY, size, color: pdfRgb(0.1, 0.1, 0.1) });
              currentY -= lineHeight;
              if (currentY < margin + 20) {
                page = pdfDoc.addPage([w, h]);
                currentY = h - margin;
              }
            }
          }
          outputBytes = await pdfDoc.save();
          newName = `${files[0].name.split('.')[0]}_converted.pdf`;
          break;
        }
        case 'pdf-to-word':
        case 'pdf-to-excel':
        case 'pdf-to-ppt':
        case 'pdf-to-jpg':
        case 'ocr': {
          // Try iLovePDF API first, fall back to client-side processing
          let resultBlob: Blob;
          let resultFile: string;
          try {
            const apiResult = await processViaILovePDF(toolId, files);
            resultBlob = apiResult.blob;
            resultFile = apiResult.fileName;
          } catch {
            const buffer = await fileToArrayBuffer(files[0]);
            if (toolId === 'pdf-to-word') {
              // Build a real, openable .docx (not a .txt dump) so the output
              // actually opens in Word/LibreOffice/Google Docs.
              resultBlob = await pdfToDocxNative(buffer);
              resultFile = `${files[0].name.replace('.pdf', '')}.docx`;
            } else if (toolId === 'pdf-to-excel') {
              resultBlob = await pdfToXlsxNative(buffer);
              resultFile = `${files[0].name.replace('.pdf', '')}.xlsx`;
            } else if (toolId === 'pdf-to-ppt') {
              resultBlob = await pdfToPptxNative(buffer);
              resultFile = `${files[0].name.replace('.pdf', '')}.pptx`;
            } else if (toolId === 'pdf-to-jpg') {
              resultBlob = await pdfToZipOfJpgs(buffer);
              resultFile = `${files[0].name.replace('.pdf', '')}_images.zip`;
            } else {
              const text = await extractTextFromPdf(buffer);
              resultBlob = new Blob([`OCR Result: ${files[0].name}\n${'='.repeat(40)}\n\n${text}\n\n---\nText extracted client-side via pdf.js`], { type: 'text/plain' });
              resultFile = `${files[0].name.replace('.pdf', '')}_ocr.txt`;
            }
          }
          const url = URL.createObjectURL(resultBlob);
          setResultBlobUrl(url);
          setResultFileName(resultFile);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', resultFile);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'ai-summarizer':
        case 'translate': {
          // Try Groq AI API first, fall back to client-side text extraction
          const buffer = await fileToArrayBuffer(files[0]);
          const pdfText = await extractTextFromPdf(buffer);
          let resultBlob: Blob;
          let resultFile: string;
          try {
            const aiResult = await processWithAI(
              toolId as 'summarize' | 'translate',
              pdfText,
              toolId === 'ai-summarizer' ? { length: summaryLength } : { language: translateLang }
            );
            resultBlob = new Blob([aiResult], { type: 'text/markdown' });
            resultFile = toolId === 'ai-summarizer'
              ? `${files[0].name.replace('.pdf', '')}_ai_summary.md`
              : `${files[0].name.replace('.pdf', '')}_translated_${translateLang}.md`;
          } catch {
            // Fallback: basic text extraction
            const words = pdfText.split(/\s+/).filter(Boolean).length;
            const chars = pdfText.length;
            const infos = await getPdfPageInfos(buffer);
            if (toolId === 'ai-summarizer') {
              const fallback = [
                `# AI Summary: ${files[0].name}`,
                `**Pages**: ${infos.length}`, `**Words**: ${words}`, `**Characters**: ${chars}`,
                `---`, pdfText.substring(0, 3000) + (pdfText.length > 3000 ? '\n\n...[truncated]...' : ''),
              ].join('\n');
              resultBlob = new Blob([fallback], { type: 'text/markdown' });
              resultFile = `${files[0].name.replace('.pdf', '')}_summary.md`;
            } else {
              resultBlob = new Blob([`Document: ${files[0].name}\nPages: ${infos.length}\n\n${pdfText.substring(0, 5000)}`], { type: 'text/plain' });
              resultFile = `${files[0].name.replace('.pdf', '')}_extracted.txt`;
            }
          }
          const url = URL.createObjectURL(resultBlob);
          setResultBlobUrl(url);
          setResultFileName(resultFile);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', resultFile);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'edit': {
          if (visualAnnotations.length === 0) {
            throw new Error('Please add at least one annotation, shape, stamp, or text mark on the page before processing.');
          }
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await applyVisualAnnotationsToPdf(buffer, visualAnnotations);
          newName = `${files[0].name.replace('.pdf', '')}_annotated.pdf`;
          break;
        }
        case 'compare': {
          const { PDFDocument } = await import('pdf-lib');
          const doc1 = await PDFDocument.load(await fileToArrayBuffer(files[0]));
          const doc2 = files[1] ? await PDFDocument.load(await fileToArrayBuffer(files[1])) : null;
          
          const pages1 = doc1.getPageCount();
          const pages2 = doc2 ? doc2.getPageCount() : 0;
          const size1 = files[0].size;
          const size2 = files[1] ? files[1].size : 0;
          const title1 = doc1.getTitle() || 'Not set';
          const title2 = doc2 ? doc2.getTitle() || 'Not set' : 'N/A';
          const author1 = doc1.getAuthor() || 'Not set';
          const author2 = doc2 ? doc2.getAuthor() || 'Not set' : 'N/A';
          
          const textReport = [
            '='.repeat(50),
            'PDF COMPARISON REPORT',
            '='.repeat(50),
            '',
            `Generated: ${new Date().toLocaleString()}`,
            '',
            '─'.repeat(50),
            'DOCUMENT 1',
            '─'.repeat(50),
            `Name:   ${files[0].name}`,
            `Title:  ${title1}`,
            `Author: ${author1}`,
            `Pages:  ${pages1}`,
            `Size:   ${(size1 / 1024).toFixed(1)} KB (${size1} bytes)`,
            '',
            '─'.repeat(50),
            'DOCUMENT 2',
            '─'.repeat(50),
            `Name:   ${files[1] ? files[1].name : 'Not provided'}`,
            `Title:  ${title2}`,
            `Author: ${author2}`,
            `Pages:  ${pages2}`,
            `Size:   ${files[1] ? (size2 / 1024).toFixed(1) + ' KB (' + size2 + ' bytes)' : 'N/A'}`,
            '',
            '─'.repeat(50),
            'DIFFERENCES',
            '─'.repeat(50),
            `Page count delta:  ${files[1] ? Math.abs(pages1 - pages2) : 'N/A'}`,
            `Size delta:        ${files[1] ? Math.abs(size1 - size2) + ' bytes' : 'N/A'}`,
            `Same page count:   ${files[1] ? (pages1 === pages2 ? 'Yes' : 'No') : 'N/A'}`,
            `Same title:        ${files[1] ? (title1 === title2 ? 'Yes' : 'No') : 'N/A'}`,
            '',
            '[Note: Full content comparison requires server-side text extraction.]'
          ].join('\n');
          
          const txtBlob = new Blob([textReport], { type: 'text/plain' });
          const url = URL.createObjectURL(txtBlob);
          setResultBlobUrl(url);
          setResultFileName('pdf_comparison_report.txt');
          setIsSuccess(true);
          setIsProcessing(false);
          
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', 'pdf_comparison_report.txt');
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 70, spread: 50 });
          return;
        }
        case 'scan': {
          if (capturedImages.length === 0) {
            throw new Error('Please capture at least one camera snapshot first.');
          }
          outputBytes = await imagesToPdf(capturedImages, {
            pageSize: 'a4',
            orientation: 'portrait',
            margin: 10
          });
          newName = 'scanned_document.pdf';
          break;
        }
        case 'remove-pages': {
          const buffer = await fileToArrayBuffer(files[0]);
          const indicesToRemove = pagesToRemove
            .split(',')
            .map(x => parseInt(x.trim()) - 1)
            .filter(x => !isNaN(x) && x >= 0);
          outputBytes = await removePages(buffer, indicesToRemove);
          newName = `${files[0].name.replace('.pdf', '')}_pages_removed.pdf`;
          break;
        }
        case 'extract-pages': {
          const buffer = await fileToArrayBuffer(files[0]);
          const indicesToExtract = pagesToExtract
            .split(',')
            .map(x => parseInt(x.trim()) - 1)
            .filter(x => !isNaN(x) && x >= 0);
          outputBytes = await extractPages(buffer, indicesToExtract);
          newName = `${files[0].name.replace('.pdf', '')}_extracted_pages.pdf`;
          break;
        }
        case 'pdf-to-pdfa': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await pdfToPdfa(buffer, pdfaStandard);
          newName = `${files[0].name.replace('.pdf', '')}_standardized_pdfa.pdf`;
          break;
        }
        case 'pdf-to-markdown':
        case 'validate-pdfa': {
          let resultBlob: Blob;
          let resultFile: string;
          if (toolId === 'pdf-to-markdown') {
            try {
              const apiResult = await processViaILovePDF(toolId, files);
              resultBlob = apiResult.blob;
              resultFile = apiResult.fileName;
            } catch {
              const buffer = await fileToArrayBuffer(files[0]);
              const md = await pdfToMarkdownNative(buffer);
              resultBlob = new Blob([md], { type: 'text/markdown' });
              resultFile = `${files[0].name.replace('.pdf', '')}.md`;
            }
          } else {
            const apiResult = await processViaILovePDF(toolId, files);
            resultBlob = apiResult.blob;
            resultFile = apiResult.fileName;
          }
          const url = URL.createObjectURL(resultBlob);
          setResultBlobUrl(url);
          setResultFileName(resultFile);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', resultFile);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'metadata': {
          const buffer = await fileToArrayBuffer(files[0]);
          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.load(buffer);
          pdfDoc.setTitle(metaTitle);
          pdfDoc.setAuthor(metaAuthor);
          pdfDoc.setSubject(metaSubject);
          pdfDoc.setKeywords(metaKeywords.split(',').map(k => k.trim()));
          outputBytes = await pdfDoc.save();
          newName = `${files[0].name.replace('.pdf', '')}_metadata_updated.pdf`;
          break;
        }
        case 'crop': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await cropPdf(buffer, cropPercent);
          newName = `${files[0].name.replace('.pdf', '')}_cropped.pdf`;
          break;
        }
        case 'forms': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await fillPdfForms(buffer, {
            'Full Name': formName,
            'Name': formName,
            'Email Address': formEmail,
            'Email': formEmail,
            'Notes': formNotes,
            'Feedback': formNotes
          });
          newName = `${files[0].name.replace('.pdf', '')}_form_filled.pdf`;
          break;
        }
        case 'redact': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await redactPdf(buffer, redactText, '#000000');
          newName = `${files[0].name.replace('.pdf', '')}_redacted.pdf`;
          break;
        }
        case 'flatten-pdf': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await flattenPdf(buffer);
          newName = `${files[0].name.replace('.pdf', '')}_flattened.pdf`;
          break;
        }
        case 'header-footer': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await addHeaderFooter(buffer, hfHeaderText, hfFooterText);
          newName = `${files[0].name.replace('.pdf', '')}_with_header_footer.pdf`;
          break;
        }
        case 'add-blank-pages': {
          const buffer = await fileToArrayBuffer(files[0]);
          const { PDFDocument } = await import('pdf-lib');
          const tempDoc = await PDFDocument.load(buffer);
          const totalPages = tempDoc.getPageCount();
          const pos = blankPositions === 'end'
            ? [totalPages]
            : blankPositions === 'start'
              ? [0]
              : blankCustomPos.split(',').map(x => Math.max(0, parseInt(x.trim()) - 1)).filter(x => !isNaN(x));
          outputBytes = await addBlankPages(buffer, pos, blankCount);
          newName = `${files[0].name.replace('.pdf', '')}_with_blank_pages.pdf`;
          break;
        }
        case 'pdf-to-txt': {
          const buffer = await fileToArrayBuffer(files[0]);
          const text = await extractTextFromPdf(buffer);
          const blob = new Blob([text], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          setResultBlobUrl(url);
          setResultFileName(`${files[0].name.replace('.pdf', '')}.txt`);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', `${files[0].name.replace('.pdf', '')}.txt`);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'txt-to-pdf': {
          outputBytes = await txtToPdf(txtContent, {
            pageSize: txtPageSize,
            margin: txtMargin,
          });
          newName = 'document.txt.pdf';
          break;
        }
        case 'pdf-to-html': {
          const buffer = await fileToArrayBuffer(files[0]);
          const htmlContent = await pdfToHtml(buffer);
          const blob = new Blob([htmlContent], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          setResultBlobUrl(url);
          setResultFileName(`${files[0].name.replace('.pdf', '')}.html`);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', `${files[0].name.replace('.pdf', '')}.html`);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'pdf-to-png': {
          const buffer = await fileToArrayBuffer(files[0]);
          const { renderPdfPageToCanvas } = await import('@/lib/pdf-client');
          const canvas = await renderPdfPageToCanvas(buffer, pngPageNum, pngScale);
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
          const url = URL.createObjectURL(blob);
          setResultBlobUrl(url);
          setResultFileName(`${files[0].name.replace('.pdf', '')}_page${pngPageNum}.png`);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', `${files[0].name.replace('.pdf', '')}_page${pngPageNum}.png`);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'permissions': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await setPermissions(buffer, {
            printing: permPrinting,
            changing: permChanging,
            copying: permCopying,
          });
          newName = `${files[0].name.replace('.pdf', '')}_permissions.pdf`;
          break;
        }
        case 'remove-metadata': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await deepSanitizePdf(buffer);
          newName = `${files[0].name.replace('.pdf', '')}_sanitized.pdf`;
          break;
        }
        case 'redact-by-search': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await redactByTextSearch(buffer, redactSearchText, '#000000');
          newName = `${files[0].name.replace('.pdf', '')}_redacted.pdf`;
          break;
        }
        case 'reverse-pages': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await reversePages(buffer);
          newName = `${files[0].name.replace('.pdf', '')}_reversed.pdf`;
          break;
        }
        case 'n-up': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await nUpLayout(buffer, nUpCount);
          newName = `${files[0].name.replace('.pdf', '')}_nup.pdf`;
          break;
        }
        case 'bates-numbering': {
          const buffer = await fileToArrayBuffer(files[0]);
          outputBytes = await batesNumbering(buffer, batesStart, batesPrefix, batesSuffix);
          newName = `${files[0].name.replace('.pdf', '')}_bates.pdf`;
          break;
        }
        case 'form-extract': {
          const buffer = await fileToArrayBuffer(files[0]);
          const jsonData = await extractFormData(buffer);
          const blob = new Blob([jsonData], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          setResultBlobUrl(url);
          setResultFileName(`${files[0].name.replace('.pdf', '')}_form_data.json`);
          setIsSuccess(true);
          setIsProcessing(false);
          const tempLink = document.createElement('a');
          tempLink.href = url;
          tempLink.setAttribute('download', `${files[0].name.replace('.pdf', '')}_form_data.json`);
          document.body.appendChild(tempLink);
          tempLink.click();
          document.body.removeChild(tempLink);
          confetti({ particleCount: 80, spread: 60 });
          return;
        }
        case 'validate-pdfua': {
          const buffer = await fileToArrayBuffer(files[0]);
          const result = await validatePdfuaCompliance(buffer);
          setPdfuaResult(result);
          setIsProcessing(false);
          if (result.passed) {
            confetti({ particleCount: 80, spread: 60 });
          }
          return;
        }
        default:
          throw new Error('Unknown tool.');
      }

      // Convert result to blob
      const blob = new Blob([new Uint8Array(outputBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResultBlobUrl(url);
      setResultFileName(newName);
      setIsSuccess(true);
      
      // Auto-trigger browser download
      const tempLink = document.createElement('a');
      tempLink.href = url;
      tempLink.setAttribute('download', newName);
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);

      // Play success confetti
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
      
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to process document.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setResultBlobUrl(null);
    setIsSuccess(false);
    clearCanvas();
    setVisualAnnotations([]);
    setEditPageNum(1);
    setPageItems([]);
  };

  const handlePipelineContinue = async (targetId: string, targetName: string) => {
    if (!resultBlobUrl) return;
    try {
      const res = await fetch(resultBlobUrl);
      const blob = await res.blob();
      const cleanFileName = resultFileName || 'document.pdf';
      const carried = new File([blob], cleanFileName, { type: 'application/pdf' });
      if (onSwitchTool) {
        onSwitchTool(targetId, targetName, [carried]);
      } else {
        setFiles([carried]);
        setIsSuccess(false);
        setResultBlobUrl(null);
      }
    } catch (err) {
      console.error('Failed to continue pipeline', err);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-slate-800 font-sans animate-fade-in">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <h1 className="text-lg font-bold text-slate-900">{toolName}</h1>
        </div>
      </header>

      {/* Success Portal Screen */}
      {isSuccess ? (
        <main className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 max-w-xl mx-auto text-center animate-scale-in">
          <div className="rounded-full bg-emerald-100 p-4 mb-5 border border-emerald-200 shadow-inner">
            <CheckCircle className="w-12 h-12 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Task completed successfully!</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Your file <strong>{resultFileName}</strong> is processing client-side and has downloaded automatically to your browser.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full">
            <a 
              href={resultBlobUrl || '#'}
              download={resultFileName}
              className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-red-600/20 transition-all text-sm"
            >
              <Download className="w-5 h-5" />
              <span>Download PDF</span>
            </a>
            <button 
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-6 py-3.5 rounded-xl transition-all text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Process another file</span>
            </button>
          </div>

          {/* Stirling-PDF Inspired Workflow Pipeline */}
          <div className="mt-8 pt-6 border-t border-slate-200 w-full text-left">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-red-600" />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Workflow Pipeline — Continue in another tool
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Pass this document directly to another tool with zero download-and-reupload:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'compress', name: 'Compress PDF', icon: '🗜️' },
                { id: 'watermark', name: 'Watermark', icon: '💧' },
                { id: 'sign', name: 'Sign Document', icon: '✍️' },
                { id: 'protect', name: 'Protect / Lock', icon: '🔒' },
                { id: 'edit', name: 'Markup & Edit', icon: '✏️' },
                { id: 'organize', name: 'Organize Matrix', icon: '📂' },
                { id: 'remove-metadata', name: 'Sanitize Privacy', icon: '🛡️' },
                { id: 'pdf-to-word', name: 'Convert to Word', icon: '📄' },
                { id: 'pdf-to-png', name: 'Export PNGs', icon: '🖼️' },
                { id: 'page-numbers', name: 'Page Numbers', icon: '#️⃣' },
                { id: 'split', name: 'Split Pages', icon: '✂️' },
                { id: 'rotate', name: 'Rotate PDF', icon: '🔄' },
              ].map((pt) => (
                <button
                  key={pt.id}
                  onClick={() => handlePipelineContinue(pt.id, pt.name)}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 hover:border-red-500 hover:bg-red-50/30 text-slate-700 hover:text-red-700 transition-all text-xs font-semibold shadow-sm text-left group"
                >
                  <span className="text-base">{pt.icon}</span>
                  <span className="truncate">{pt.name}</span>
                </button>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          
          {/* Main workspace (file loading dropzone) */}
          <main className="flex-1 flex flex-col overflow-y-auto p-8 bg-slate-100">
            {toolId === 'scan' ? (
              <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl p-6 shadow-md overflow-y-auto">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Webcam Document Scanner</h3>
                <p className="text-xs text-slate-400 mb-6">Capture documents using your web-camera, crop, compile and download as PDF.</p>
                {cameraActive ? (
                  <div className="w-full max-w-xl flex flex-col gap-4 mx-auto">
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-black aspect-[4/3] w-full shadow-inner">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={captureFrame}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold text-sm py-3.5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Camera className="w-5 h-5" />
                        <span>Capture Frame</span>
                      </button>
                      <button
                        onClick={stopCamera}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm px-6 py-3.5 rounded-xl transition-all"
                      >
                        Stop Scanner
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="rounded-2xl bg-red-100/50 border border-red-100 p-4 mb-4 inline-block">
                      <Camera className="w-10 h-10 text-red-600" />
                    </div>
                    <p className="text-sm text-slate-500 mb-6">Capture documents or photos using your computer camera and compile to PDF.</p>
                    <button
                      onClick={startCamera}
                      className="bg-red-600 hover:bg-red-500 text-white font-bold text-sm px-8 py-3.5 rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center gap-2 mx-auto"
                    >
                      <Camera className="w-5 h-5" />
                      <span>Start Camera Scanner</span>
                    </button>
                  </div>
                )}

                {capturedImages.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200 w-full">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-4">Captured Pages ({capturedImages.length})</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                      {capturedImages.map((img, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-200 group aspect-[3/4] bg-slate-50 shadow-sm">
                          <img src={img} alt={`Captured page ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => setCapturedImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute inset-0 bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-bold text-xs"
                          >
                            Remove Page
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : toolId === 'html-to-pdf' ? (
              <div className="flex-1 flex gap-6 overflow-hidden min-h-[400px]">
                {/* HTML Input Editor */}
                <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-lg p-5">
                  <h3 className="text-sm font-bold text-slate-200 mb-3">HTML Source Code</h3>
                  <textarea
                    value={htmlCode}
                    onChange={e => setHtmlCode(e.target.value)}
                    className="flex-1 resize-none bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed focus:outline-none focus:border-red-500/50"
                  />
                </div>
                {/* Visual rendering simulation */}
                <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow p-5 overflow-y-auto">
                  <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">Preview</h3>
                  <div 
                    className="prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: htmlCode }}
                  />
                </div>
              </div>
            ) : toolId === 'txt-to-pdf' ? (
              <div className="flex-1 flex bg-white border border-slate-200 rounded-2xl p-6 shadow-md">
                <div className="flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">Text to PDF</h3>
                  <textarea
                    value={txtContent}
                    onChange={e => setTxtContent(e.target.value)}
                    rows={16}
                    className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-sans leading-relaxed focus:outline-none focus:border-red-500"
                  />
                  {errorMsg && (
                    <p className="mt-4 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">{errorMsg}</p>
                  )}
                </div>
              </div>
            ) : files.length === 0 ? (
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 flex flex-col items-center justify-center border-3 border-dashed rounded-2xl p-12 text-center transition-all ${
                  isDragOver 
                    ? 'border-red-500 bg-red-50/50' 
                    : 'border-slate-300 hover:border-slate-400 bg-white shadow-md'
                }`}
              >
                <div className="rounded-2xl bg-red-100/50 border border-red-100 p-4 mb-4">
                  <Upload className="w-10 h-10 text-red-600 animate-bounce" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">
                  {toolId === 'jpg-to-pdf' ? 'Drag image files here' : 
                   toolId === 'word-to-pdf' ? 'Drag Word document here' :
                   toolId === 'excel-to-pdf' ? 'Drag Excel spreadsheet here' :
                   toolId === 'ppt-to-pdf' ? 'Drag PPT presentation here' :
                   'Drag PDF files here'}
                </h3>
                <p className="mt-1.5 text-xs text-slate-500">or click the button below to upload from your disk</p>
                
                <label className="mt-6 cursor-pointer bg-red-600 hover:bg-red-500 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-lg shadow-red-600/25 transition-all">
                  <span>Select Files</span>
                  <input
                    type="file"
                    multiple={toolId === 'merge' || toolId === 'jpg-to-pdf' || toolId === 'compare'}
                    accept={toolId === 'jpg-to-pdf' ? '.jpg,.jpeg,.png' : 
                            toolId === 'word-to-pdf' ? '.doc,.docx' :
                            toolId === 'excel-to-pdf' ? '.xls,.xlsx,.csv' :
                            toolId === 'ppt-to-pdf' ? '.ppt,.pptx' :
                            '.pdf'}
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
                
                {errorMsg && (
                  <p className="mt-4 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">{errorMsg}</p>
                )}
              </div>
            ) : (
              // File List display
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-bold text-slate-800">
                    Uploaded Files ({files.length})
                  </h3>
                  <button 
                    onClick={handleReset}
                    className="text-xs text-red-600 hover:underline font-semibold"
                  >
                    Clear all
                  </button>
                </div>

                {/* Open PDF Studio Interactive Vector Markup Studio */}
                {toolId === 'edit' && files.length === 1 ? (
                  <div className="space-y-4">
                    {/* Floating Vector Tool Bar */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: 'freehand', label: 'Pen', icon: <PenTool className="w-4 h-4" /> },
                          { id: 'highlighter', label: 'Highlighter', icon: <Highlighter className="w-4 h-4" /> },
                          { id: 'rect', label: 'Box', icon: <Square className="w-4 h-4" /> },
                          { id: 'circle', label: 'Circle', icon: <Circle className="w-4 h-4" /> },
                          { id: 'arrow', label: 'Arrow', icon: <ArrowRight className="w-4 h-4" /> },
                          { id: 'text', label: 'Text', icon: <Type className="w-4 h-4" /> },
                          { id: 'stamp', label: 'Stamp', icon: <Stamp className="w-4 h-4" /> },
                          { id: 'measurement', label: 'Ruler', icon: <Ruler className="w-4 h-4" /> },
                        ].map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setEditToolType(t.id as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              editToolType === t.id
                                ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {t.icon}
                            <span>{t.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Quick Color Palette */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
                          {['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#0f172a'].map((c) => (
                            <button
                              key={c}
                              onClick={() => setEditColor(c)}
                              className={`w-5 h-5 rounded-full transition-transform ${
                                editColor === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>

                        {/* Undo and Clear */}
                        <button
                          onClick={undoLastAnnotation}
                          disabled={visualAnnotations.length === 0}
                          title="Undo last markup"
                          className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-30 text-slate-700"
                        >
                          <Undo className="w-4 h-4" />
                        </button>
                        <button
                          onClick={clearPageAnnotations}
                          title="Clear page markup"
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-500 transition-colors"
                        >
                          Clear Page
                        </button>
                      </div>
                    </div>

                    {/* Page Navigation and Info */}
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-slate-500">
                        {editToolType === 'freehand' && '✏️ Drag on the page to draw freehand strokes.'}
                        {editToolType === 'highlighter' && '🖍️ Drag over any area to apply a semi-transparent highlighter.'}
                        {editToolType === 'rect' && '🔲 Click & drag to draw a vector box rectangle.'}
                        {editToolType === 'circle' && '⭕ Click & drag to draw an ellipse or circle.'}
                        {editToolType === 'arrow' && '➡️ Click & drag to draw a directional arrow.'}
                        {editToolType === 'text' && '🔤 Click anywhere on the page to place a text note.'}
                        {editToolType === 'stamp' && `🏷️ Click on the page to place the "${editStampType}" stamp.`}
                        {editToolType === 'measurement' && '📏 Drag between 2 points to measure calibrated distance.'}
                      </p>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <button
                          onClick={() => setEditPageNum((p) => Math.max(1, p - 1))}
                          disabled={editPageNum <= 1}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30"
                        >
                          ←
                        </button>
                        <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
                          Page {editPageNum} / {totalPageCount || 1}
                        </span>
                        <button
                          onClick={() => setEditPageNum((p) => Math.min(totalPageCount || p, p + 1))}
                          disabled={editPageNum >= (totalPageCount || 1)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30"
                        >
                          →
                        </button>
                      </div>
                    </div>

                    {/* Interactive Canvas Container */}
                    <div
                      ref={editPreviewContainerRef}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                      className="flex justify-center bg-slate-100/80 border border-slate-200 rounded-2xl p-6 min-h-[300px] items-center overflow-auto shadow-inner"
                    />

                    {/* Active Annotations Chips */}
                    {visualAnnotations.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Active Markups ({visualAnnotations.length})
                          </p>
                          <span className="text-[10px] text-slate-400">
                            {visualAnnotations.filter((a) => a.page === editPageNum).length} on this page
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visualAnnotations.map((ann) => (
                            <div
                              key={ann.id}
                              className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs shadow-sm"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ann.color }} />
                              <span className="font-semibold text-slate-700 capitalize">
                                {ann.type} {ann.text ? `"${ann.text}"` : ann.stampType || ''}
                              </span>
                              <span className="text-slate-400">p.{ann.page}</span>
                              <button
                                onClick={() => removeVisualAnnotation(ann.id)}
                                className="text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : toolId === 'organize' && files.length === 1 ? (
                  <div className="space-y-4">
                    {/* KillerPDF Organize Batch Actions Bar */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-bold text-slate-700">
                          {pageItems.length} Page{pageItems.length !== 1 ? 's' : ''} in Sequence
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={rotateAllPages}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                          <span>Rotate All (+90°)</span>
                        </button>
                        <button
                          onClick={reverseAllPages}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                          <span>Reverse Sequence</span>
                        </button>
                        <button
                          onClick={resetPageItems}
                          className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-500 transition-all"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Page Matrix Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {pageItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-col justify-between items-center h-48 relative group hover:border-red-500 hover:shadow-md transition-all"
                        >
                          {/* Page Thumbnail Card */}
                          <div
                            className="rounded-xl bg-slate-50 border border-slate-200 flex-1 w-full flex flex-col items-center justify-center font-mono font-bold text-slate-500 relative overflow-hidden transition-transform"
                            style={{ transform: `rotate(${item.rotation}deg)` }}
                          >
                            <span className="text-xs">Page {item.originalIndex + 1}</span>
                          </div>

                          {/* Rotation indicator badge */}
                          {item.rotation > 0 && (
                            <span className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                              {item.rotation}° ↻
                            </span>
                          )}

                          {/* Footer Order and Actions */}
                          <div className="mt-2.5 flex items-center justify-between w-full text-xs">
                            <span className="font-bold text-slate-600 text-[11px]">#{idx + 1}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => rotatePageItem(idx)}
                                title="Rotate 90°"
                                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => duplicatePageItem(idx)}
                                title="Duplicate Page"
                                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => movePageItem(idx, idx - 1)}
                                disabled={idx === 0}
                                title="Move Left"
                                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-20 text-slate-500"
                              >
                                ←
                              </button>
                              <button
                                onClick={() => movePageItem(idx, idx + 1)}
                                disabled={idx === pageItems.length - 1}
                                title="Move Right"
                                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-20 text-slate-500"
                              >
                                →
                              </button>
                              <button
                                onClick={() => deletePageItem(idx)}
                                title="Delete Page"
                                className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Normal Multi-file Card list
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file, idx) => (
                      <div 
                        key={idx}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-red-50 border border-red-100 p-2">
                            <FileText className="w-6 h-6 text-red-600" />
                          </div>
                          <div className="max-w-[180px]">
                            <p className="font-bold text-slate-800 text-xs truncate">{file.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveFile(idx)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Quick Append selectors */}
                    {(toolId === 'merge' || toolId === 'jpg-to-pdf') && (
                      <label className="border border-dashed border-slate-300 hover:border-red-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer text-slate-500 hover:text-red-600 bg-white/50 transition-colors h-full">
                        <Plus className="w-6 h-6" />
                        <span className="text-xs font-semibold mt-1">Add files</span>
                        <input
                          type="file"
                          multiple
                          accept={toolId === 'jpg-to-pdf' ? '.jpg,.jpeg,.png' : '.pdf'}
                          onChange={handleFileInput}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Right Sidebar Options panel */}
          {(files.length > 0 || toolId === 'scan' || toolId === 'html-to-pdf' || toolId === 'txt-to-pdf') && (
            <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shadow-2xl overflow-y-auto animate-slide-in-right">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50 shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">Tool Configurations</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Custom processing parameters</p>
              </div>

              {/* Configurations Fields mapping by toolId */}
              <div className="p-5 flex-1 space-y-5">
                
                {/* 1. Merge PDF options */}
                {toolId === 'merge' && (
                  <div className="text-xs text-slate-500 space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl">
                    <p className="font-semibold text-slate-800">Merge PDF Rules:</p>
                    <p>• The files will be combined in the listed sequence.</p>
                    <p>• Make sure the files are ordered correctly before compiling.</p>
                  </div>
                )}

                {/* 2. Split PDF options */}
                {toolId === 'split' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">From Page</label>
                        <input 
                          type="number" 
                          min={1} 
                          value={splitStart}
                          onChange={e => setSplitStart(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">To Page</label>
                        <input 
                          type="number" 
                          min={1} 
                          value={splitEnd}
                          onChange={e => setSplitEnd(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Rotate PDF options */}
                {toolId === 'rotate' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Rotation angle</label>
                    <div className="flex gap-2">
                      {[90, 180, 270].map(angle => (
                        <button
                          key={angle}
                          onClick={() => setRotationAngle(angle)}
                          className={`flex-1 py-3 border text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                            rotationAngle === angle 
                              ? 'bg-red-50 border-red-500 text-red-600' 
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>{angle}°</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Watermark PDF options */}
                {toolId === 'watermark' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Watermark Text</label>
                      <input 
                        type="text" 
                        value={watermarkText}
                        onChange={e => setWatermarkText(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Text Color</label>
                        <input 
                          type="color" 
                          value={watermarkColor}
                          onChange={e => setWatermarkColor(e.target.value)}
                          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-lg p-0.5 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Font Size</label>
                        <input 
                          type="number" 
                          min={12} 
                          max={72}
                          value={watermarkSize}
                          onChange={e => setWatermarkSize(parseInt(e.target.value) || 24)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Opacity ({Math.round(watermarkOpacity * 100)}%)</label>
                      <input 
                        type="range" 
                        min={0.1} 
                        max={1.0} 
                        step={0.1}
                        value={watermarkOpacity}
                        onChange={e => setWatermarkOpacity(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Placement Position</label>
                      <select 
                        value={watermarkPos}
                        onChange={e => setWatermarkPos(e.target.value as 'center' | 'top-right' | 'bottom-left' | 'top-left' | 'bottom-right')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      >
                        <option value="center">Center</option>
                        <option value="top-left">Top-Left</option>
                        <option value="top-right">Top-Right</option>
                        <option value="bottom-left">Bottom-Left</option>
                        <option value="bottom-right">Bottom-Right</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 5. Protect PDF / Lock options */}
                {(toolId === 'protect' || toolId === 'unlock') && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-100 bg-red-50/50 p-3.5 flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-[10px] text-slate-500 leading-normal">
                        <strong>Security Notice:</strong> Protecting/Unlocking uses secure browser XOR encoding. Encrypted files must be unlocked back in this utility.
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        {toolId === 'protect' ? 'Set password' : 'Enter unlock password'}
                      </label>
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      />
                    </div>

                    {toolId === 'protect' && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Confirm password</label>
                        <input 
                          type="password" 
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Sign PDF Canvas options */}
                {toolId === 'sign' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Draw Signature</label>
                      <canvas
                        ref={canvasRef}
                        width={280}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="border border-slate-200 rounded-lg cursor-crosshair bg-slate-50 hover:bg-white transition-all shadow-inner"
                      />
                      <button 
                        onClick={clearCanvas}
                        className="mt-1 text-[10px] text-red-600 hover:underline font-semibold block text-right w-full"
                      >
                        Clear Sketch
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Target Page</label>
                        <input 
                          type="number" 
                          min={1} 
                          max={totalPageCount || 1}
                          value={signPageNum}
                          onChange={e => setSignPageNum(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Scale Width</label>
                        <input 
                          type="number" 
                          min={50} 
                          max={500}
                          value={signW}
                          onChange={e => setSignW(parseInt(e.target.value) || 150)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">X Offset (Left)</label>
                        <input 
                          type="number" 
                          min={0}
                          value={signX}
                          onChange={e => setSignX(parseInt(e.target.value) || 50)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Y Offset (Bottom)</label>
                        <input 
                          type="number" 
                          min={0}
                          value={signY}
                          onChange={e => setSignY(parseInt(e.target.value) || 50)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. JPG to PDF Image options */}
                {toolId === 'jpg-to-pdf' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Page Size</label>
                      <div className="flex gap-2">
                        {['a4', 'letter'].map(size => (
                          <button
                            key={size}
                            onClick={() => setImgPageSize(size as 'a4' | 'letter')}
                            className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all capitalize ${
                              imgPageSize === size 
                                ? 'bg-red-50 border-red-500 text-red-600' 
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Orientation</label>
                      <div className="flex gap-2">
                        {['portrait', 'landscape'].map(orient => (
                          <button
                            key={orient}
                            onClick={() => setImgOrientation(orient as 'portrait' | 'landscape')}
                            className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all capitalize ${
                              imgOrientation === orient 
                                ? 'bg-red-50 border-red-500 text-red-600' 
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {orient}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Margins</label>
                      <div className="flex gap-2">
                        {[
                          { label: 'None', val: 0 },
                          { label: 'Small', val: 10 },
                          { label: 'Big', val: 25 }
                        ].map(m => (
                          <button
                            key={m.label}
                            onClick={() => setImgMargin(m.val)}
                            className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all ${
                              imgMargin === m.val 
                                ? 'bg-red-50 border-red-500 text-red-600' 
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                  </div>
                </div>
              </div>
            )}

                {/* 8. Page Numbers options */}
                {toolId === 'page-numbers' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Page number position</label>
                      <select 
                        value={pageNumberPos}
                        onChange={e => setPageNumberPos(e.target.value as 'bottom-center' | 'bottom-right' | 'top-center')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      >
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                        <option value="top-center">Top Center</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 9. Compress PDF options */}
                {toolId === 'compress' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Compression Engine:</p>
                    <p>• Native optimization removes redundant binary file definitions.</p>
                    <p>• Optimizes object streams for smaller, faster downloads.</p>
                  </div>
                )}

                {/* 10. Repair PDF options */}
                {toolId === 'repair' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Repair Information:</p>
                    <p>• Re-indexes all internal catalog structures and xref offsets.</p>
                    <p>• Fixes broken cross-reference trailer headers.</p>
                  </div>
                )}

                {/* 11. HTML to PDF options */}
                {toolId === 'html-to-pdf' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Write or Paste HTML</label>
                      <textarea
                        value={htmlCode}
                        onChange={e => setHtmlCode(e.target.value)}
                        rows={6}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                )}

                {/* 12. TXT to PDF options */}
                {toolId === 'txt-to-pdf' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Text Content</label>
                      <textarea value={txtContent} onChange={e => setTxtContent(e.target.value)} rows={8} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Page Size</label>
                      <div className="flex gap-2">
                        {['a4', 'letter'].map(s => (
                          <button key={s} onClick={() => setTxtPageSize(s as 'a4' | 'letter')} className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all capitalize ${txtPageSize === s ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 13. PDF to HTML options */}
                {toolId === 'pdf-to-html' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">HTML Export:</p>
                    <p>• Converts PDF text content to a clean HTML web page.</p>
                    <p>• Preserves page structure and paragraph formatting.</p>
                  </div>
                )}

                {/* 14. PDF to PNG options */}
                {toolId === 'pdf-to-png' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Page Number</label>
                      <input type="number" min={1} value={pngPageNum} onChange={e => setPngPageNum(parseInt(e.target.value) || 1)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Scale ({pngScale}x)</label>
                      <input type="range" min={1} max={4} step={0.5} value={pngScale} onChange={e => setPngScale(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600" />
                    </div>
                  </div>
                )}

                {/* 15. Permissions options */}
                {toolId === 'permissions' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Printing</label>
                      <div className="flex gap-2">
                          {[{l:'None',v:'none'},{l:'Low Res',v:'lowRes'},{l:'High Res',v:'highRes'}].map(o => (
                          <button key={o.v} onClick={() => setPermPrinting(o.v as 'none' | 'lowRes' | 'highRes')} className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all ${permPrinting === o.v ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{o.l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Changes Allowed</label>
                      <select value={permChanging} onChange={e => setPermChanging(e.target.value as 'none' | 'insertDelete' | 'fillSign' | 'anyExceptExtract')} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500">
                        <option value="none">None</option>
                        <option value="insertDelete">Insert/Delete Pages</option>
                        <option value="fillSign">Fill Forms & Sign</option>
                        <option value="anyExceptExtract">Any Except Extraction</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="permCopy" checked={permCopying} onChange={e => setPermCopying(e.target.checked)} className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
                      <label htmlFor="permCopy" className="text-xs font-semibold text-slate-600">Allow Copying</label>
                    </div>
                  </div>
                )}

                {/* 16. Remove Metadata options */}
                {toolId === 'remove-metadata' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Metadata Removal:</p>
                    <p>• Strips all document metadata including title, author, subject, and keywords.</p>
                    <p>• Sets producer/creator fields to generic Docify values.</p>
                  </div>
                )}

                {/* 17. Redact by Search options */}
                {toolId === 'redact-by-search' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Text to Search & Redact</label>
                      <input type="text" value={redactSearchText} onChange={e => setRedactSearchText(e.target.value)} placeholder="Enter text to redact..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                      <p className="text-[9px] text-slate-400 mt-1">Searches across all pages and masks occurrences with black rectangles.</p>
                    </div>
                  </div>
                )}

                {/* 18. Reverse Pages options */}
                {toolId === 'reverse-pages' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Reverse Pages:</p>
                    <p>• Reverses the page order of your entire PDF document instantly.</p>
                    <p>• No configuration needed — just upload and process.</p>
                  </div>
                )}

                {/* 19. N-up Layout options */}
                {toolId === 'n-up' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Pages per Sheet</label>
                      <div className="flex gap-2">
                        {[{l:'2-up',v:2},{l:'4-up',v:4},{l:'6-up',v:6}].map(o => (
                          <button key={o.v} onClick={() => setNUpCount(o.v as 2 | 4 | 6)} className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all ${nUpCount === o.v ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{o.l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 20. Bates Numbering options */}
                {toolId === 'bates-numbering' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Starting Number</label>
                      <input type="number" min={1} value={batesStart} onChange={e => setBatesStart(parseInt(e.target.value) || 1)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Prefix</label>
                        <input type="text" value={batesPrefix} onChange={e => setBatesPrefix(e.target.value)} placeholder="e.g. DOC-" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Suffix</label>
                        <input type="text" value={batesSuffix} onChange={e => setBatesSuffix(e.target.value)} placeholder="e.g. -v1" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 21. Form Data Extract options */}
                {toolId === 'form-extract' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Form Data Export:</p>
                    <p>• Extracts all filled form field names and values from your PDF.</p>
                    <p>• Outputs structured JSON format for data processing.</p>
                  </div>
                )}

                {/* 22. PDF/UA Validate options */}
                {toolId === 'validate-pdfua' && (
                  <div className="space-y-4">
                    <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                      <p className="font-bold text-slate-800">PDF/UA Accessibility Check:</p>
                      <p>• Validates document structure for PDF/Universal Accessibility standards.</p>
                      <p>• Checks for required metadata, page structure, and form fields.</p>
                    </div>
                    {pdfuaResult && (
                      <div className={`rounded-xl p-4 ${pdfuaResult.passed ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                        <p className={`font-bold text-sm ${pdfuaResult.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                          {pdfuaResult.passed ? 'PASSED' : 'FAILED'}
                        </p>
                        {pdfuaResult.issues.map((issue, i) => (
                          <p key={i} className="text-xs text-slate-600 mt-1">{issue}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Open PDF Studio Vector Controls Sidebar */}
                {toolId === 'edit' && (
                  <div className="space-y-4">
                    <div className="bg-red-50/40 p-3 border border-red-100 rounded-xl text-[11px] text-slate-600 leading-normal">
                      Active Tool: <strong className="text-red-600 uppercase">{editToolType}</strong>. Draw or click on the canvas to annotate in real time.
                    </div>

                    {/* Stamp Tool Specific Options */}
                    {editToolType === 'stamp' && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stamp Preset</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(['APPROVED', 'REJECTED', 'CONFIDENTIAL', 'DRAFT', 'PAID', 'REVIEWED', 'FINAL', 'CUSTOM'] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => {
                                setEditStampType(st);
                                if (st === 'APPROVED') setEditColor('#10b981');
                                else if (st === 'REJECTED') setEditColor('#ef4444');
                                else if (st === 'CONFIDENTIAL') setEditColor('#f59e0b');
                                else if (st === 'DRAFT') setEditColor('#3b82f6');
                                else if (st === 'PAID') setEditColor('#8b5cf6');
                                else if (st === 'REVIEWED') setEditColor('#06b6d4');
                              }}
                              className={`py-1.5 px-2 text-[10px] font-bold rounded-lg border transition-all ${
                                editStampType === st
                                  ? 'bg-red-50 border-red-500 text-red-600 shadow-sm'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                        {editStampType === 'CUSTOM' && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Custom Stamp Text</label>
                            <input
                              type="text"
                              value={customStampText}
                              onChange={(e) => setCustomStampText(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Text Note Specific Options */}
                    {editToolType === 'text' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Text Note Content</label>
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Font Size ({editSize}px)</label>
                          <input
                            type="range"
                            min={8}
                            max={48}
                            value={editSize}
                            onChange={(e) => setEditSize(parseInt(e.target.value) || 14)}
                            className="w-full accent-red-600"
                          />
                        </div>
                      </div>
                    )}

                    {/* Measurement Ruler Options */}
                    {editToolType === 'measurement' && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Measurement Unit</label>
                        <div className="flex gap-2">
                          {[
                            { unit: 'mm', ratio: 0.3528 },
                            { unit: 'cm', ratio: 0.03528 },
                            { unit: 'in', ratio: 0.01389 },
                            { unit: 'px', ratio: 1 },
                          ].map((u) => (
                            <button
                              key={u.unit}
                              onClick={() => {
                                setEditUnit(u.unit);
                                setEditScaleRatio(u.ratio);
                              }}
                              className={`flex-1 py-1.5 border text-xs font-bold rounded-lg transition-all ${
                                editUnit === u.unit
                                  ? 'bg-red-50 border-red-500 text-red-600'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              {u.unit}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shape Stroke & Fill Options */}
                    {(editToolType === 'rect' || editToolType === 'circle' || editToolType === 'line' || editToolType === 'arrow' || editToolType === 'freehand') && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Stroke Width ({editStrokeWidth}px)</label>
                          <div className="flex gap-2">
                            {[1, 2, 4, 8].map((sw) => (
                              <button
                                key={sw}
                                onClick={() => setEditStrokeWidth(sw)}
                                className={`flex-1 py-1.5 border text-xs font-bold rounded-lg transition-all ${
                                  editStrokeWidth === sw
                                    ? 'bg-red-50 border-red-500 text-red-600'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                              >
                                {sw}px
                              </button>
                            ))}
                          </div>
                        </div>

                        {(editToolType === 'rect' || editToolType === 'circle') && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Fill Color</label>
                            <div className="flex gap-2">
                              {[
                                { label: 'None', color: '' },
                                { label: 'White', color: '#ffffff' },
                                { label: 'Yellow', color: '#fef08a' },
                                { label: 'Light Red', color: '#fee2e2' },
                              ].map((f) => (
                                <button
                                  key={f.label}
                                  onClick={() => setEditFillColor(f.color)}
                                  className={`flex-1 py-1.5 border text-[10px] font-bold rounded-lg transition-all ${
                                    editFillColor === f.color
                                      ? 'bg-red-50 border-red-500 text-red-600'
                                      : 'bg-slate-50 border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Color Picker & Opacity Slider */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Primary Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="w-10 h-8 bg-slate-50 border border-slate-200 rounded-lg p-0.5 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Opacity ({Math.round(editOpacity * 100)}%)
                        </label>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={editOpacity}
                          onChange={(e) => setEditOpacity(parseFloat(e.target.value) || 1)}
                          className="w-full accent-red-600"
                        />
                      </div>
                    </div>

                    {visualAnnotations.length === 0 && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                        ✏️ Click or drag on the page preview to add vector markups, text notes, stamps, or measurements.
                      </p>
                    )}
                  </div>
                )}

                {/* 13. Compare PDF options */}
                {toolId === 'compare' && (
                  <div className="space-y-4">
                    <div className="text-xs text-slate-500 bg-red-50/40 p-4 border border-red-100 rounded-xl">
                      <p className="font-bold text-slate-800">Compare PDFs:</p>
                      <p className="mt-1">Upload exactly 2 PDF documents to run structural comparisons side-by-side.</p>
                    </div>
                  </div>
                )}

                {/* 14. Scan to PDF options */}
                {toolId === 'scan' && (
                  <div className="space-y-4">
                    {cameraActive ? (
                      <div className="space-y-3">
                        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-black aspect-video w-full">
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover scale-x-[-1]"
                          />
                        </div>
                        <button
                          onClick={captureFrame}
                          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Capture Frame</span>
                        </button>
                        <button
                          onClick={stopCamera}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2 rounded-lg transition-colors"
                        >
                          Stop Camera
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startCamera}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 rounded-lg shadow transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Start Camera Scanner</span>
                      </button>
                    )}

                    {capturedImages.length > 0 && (
                      <div className="border-t border-slate-100 pt-3">
                        <label className="text-[10px] font-bold text-slate-400 block mb-2">Captured Pages ({capturedImages.length})</label>
                        <div className="grid grid-cols-3 gap-2">
                          {capturedImages.map((img, idx) => (
                            <div key={idx} className="relative rounded overflow-hidden border border-slate-200 group aspect-[3/4]">
                              <img src={img} alt={`Captured page ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                onClick={() => setCapturedImages(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute inset-0 bg-red-600/70 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 15. OCR PDF options */}
                {toolId === 'ocr' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">OCR Scanner Info:</p>
                    <p>• Extract structural text nodes from scanned pages natively.</p>
                    <p>• Converts unsearchable pixels into standard editable strings.</p>
                  </div>
                )}

                {/* 16. Convert Banners */}
                {(toolId.includes('to-pdf') && toolId !== 'jpg-to-pdf' && toolId !== 'html-to-pdf') && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Format Conversion:</p>
                    <p>• Converts formatting styles into standard PDF vectors natively.</p>
                  </div>
                )}

                {(toolId.startsWith('pdf-to-') && toolId !== 'pdf-to-jpg') && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Extraction Output:</p>
                    <p>• Extracts text layout and downloads matching editable data files.</p>
                  </div>
                )}

                {/* 17. Remove Pages options */}
                {toolId === 'remove-pages' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Pages to Remove</label>
                      <input 
                        type="text" 
                        value={pagesToRemove}
                        onChange={e => setPagesToRemove(e.target.value)}
                        placeholder="e.g. 2, 4, 6"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Provide comma-separated page numbers to delete.</p>
                    </div>
                  </div>
                )}

                {/* 18. Extract Pages options */}
                {toolId === 'extract-pages' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Pages to Extract</label>
                      <input 
                        type="text" 
                        value={pagesToExtract}
                        onChange={e => setPagesToExtract(e.target.value)}
                        placeholder="e.g. 1, 3, 5"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Provide comma-separated page numbers to save to a new document.</p>
                    </div>
                  </div>
                )}

                {/* 19. PDF to PDF/A options */}
                {toolId === 'pdf-to-pdfa' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">PDF/A Standard</label>
                      <select 
                        value={pdfaStandard}
                        onChange={e => setPdfaStandard(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      >
                        <option value="PDF/A-1b">PDF/A-1b (Basic Archive)</option>
                        <option value="PDF/A-2b">PDF/A-2b (Unicode Archive)</option>
                        <option value="PDF/A-3b">PDF/A-3b (Embedded Files support)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 20. Crop PDF options */}
                {toolId === 'crop' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Crop Percentage ({cropPercent}%)</label>
                      <input 
                        type="range" 
                        min={5} 
                        max={40} 
                        step={5}
                        value={cropPercent}
                        onChange={e => setCropPercent(parseInt(e.target.value) || 10)}
                        className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Define margin crop width to apply to all page borders.</p>
                    </div>
                  </div>
                )}

                {/* 21. PDF Forms options */}
                {toolId === 'forms' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Full Name</label>
                      <input 
                        type="text" 
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500 mb-3"
                      />
                      
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Email Address</label>
                      <input 
                        type="email" 
                        value={formEmail}
                        onChange={e => setFormEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500 mb-3"
                      />

                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Additional Notes</label>
                      <textarea 
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                )}

                {/* 22. Redact PDF options */}
                {toolId === 'redact' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Text Target to Mask</label>
                      <input 
                        type="text" 
                        value={redactText}
                        onChange={e => setRedactText(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Specify keywords to overlay black redact blocks on.</p>
                    </div>
                  </div>
                )}

                {/* 23. AI Summarizer options */}
                {toolId === 'ai-summarizer' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Summary Detail</label>
                      <div className="flex gap-2">
                        {['brief', 'detailed'].map(len => (
                          <button
                            key={len}
                            onClick={() => setSummaryLength(len as 'brief' | 'detailed')}
                            className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-all capitalize ${
                              summaryLength === len 
                                ? 'bg-red-50 border-red-500 text-red-600' 
                                : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {len}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 24. Translate PDF options */}
                {toolId === 'translate' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Target Language</label>
                      <select 
                        value={translateLang}
                        onChange={e => setTranslateLang(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                      >
                        <option value="Spanish">Spanish (Español)</option>
                        <option value="French">French (Français)</option>
                        <option value="German">German (Deutsch)</option>
                        <option value="Chinese">Chinese (中文)</option>
                        <option value="Hindi">Hindi (हिन्दी)</option>
                        <option value="Japanese">Japanese (日本語)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 25. Validate PDF/A options */}
                {toolId === 'validate-pdfa' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">PDF/A Validation:</p>
                    <p>• Checks if your PDF meets PDF/A-1b or PDF/A-2b archival standards.</p>
                    <p>• Returns a validation report with pass/fail status.</p>
                  </div>
                )}

                {/* 26. PDF to Markdown options */}
                {toolId === 'pdf-to-markdown' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Markdown Export:</p>
                    <p>• Converts PDF content to clean Markdown format.</p>
                    <p>• Ideal for documentation, note-taking, and LLM ingestion.</p>
                  </div>
                )}

                {/* 27. PDF Metadata Editor options */}
                {toolId === 'metadata' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Title</label>
                      <input type="text" value={metaTitle} onChange={e => setMetaTitle(e.target.value)} placeholder="Document Title" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Author</label>
                      <input type="text" value={metaAuthor} onChange={e => setMetaAuthor(e.target.value)} placeholder="Author Name" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Subject</label>
                      <input type="text" value={metaSubject} onChange={e => setMetaSubject(e.target.value)} placeholder="Document Subject" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Keywords</label>
                      <input type="text" value={metaKeywords} onChange={e => setMetaKeywords(e.target.value)} placeholder="keyword1, keyword2" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Execution Error alert box */}
              {errorMsg && (
                <div className="p-4 border-t border-slate-200 bg-red-50 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-semibold text-red-600 leading-normal">{errorMsg}</p>
                </div>
              )}

              {/* Core Execution red action button */}
              <div className="p-5 border-t border-slate-200 bg-slate-50 shrink-0">
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-300 text-white font-bold text-sm py-4 rounded-xl shadow-lg shadow-red-600/20 disabled:shadow-none transition-all duration-200 uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{toolName}</span>
                    </>
                  )}
                </button>
              </div>
            </aside>
                )}

                {/* 28. Flatten PDF options */}
                {toolId === 'flatten-pdf' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Flatten PDF:</p>
                    <p>Permanently merge all annotations, comments, and form fields into the page content.</p>
                  </div>
                )}

                {/* 29. Add Blank Pages options */}
                {toolId === 'add-blank-pages' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Position</label>
                      <select value={blankPositions} onChange={e => setBlankPositions(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500">
                        <option value="end">At the end</option>
                        <option value="start">At the beginning</option>
                        <option value="custom">Custom page numbers (e.g. 1,3,5)</option>
                      </select>
                    </div>
                    {blankPositions === 'custom' && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Custom Positions</label>
                        <input type="text" value={blankCustomPos} onChange={e => setBlankCustomPos(e.target.value)} placeholder="e.g. 1,3,5" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Number of blank pages</label>
                      <input type="number" min={1} max={20} value={blankCount} onChange={e => setBlankCount(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                )}

                {/* 30. Header & Footer options */}
                {toolId === 'header-footer' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Header Text</label>
                      <input type="text" value={hfHeaderText} onChange={e => setHfHeaderText(e.target.value)} placeholder="e.g. Confidential" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Footer Text</label>
                      <input type="text" value={hfFooterText} onChange={e => setHfFooterText(e.target.value)} placeholder="e.g. Page 1 of X" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500" />
                    </div>
                  </div>
                )}

                {/* 31. PDF to TXT options */}
                {toolId === 'pdf-to-txt' && (
                  <div className="space-y-3 bg-red-50/40 p-4 border border-red-100 rounded-xl text-xs text-slate-500">
                    <p className="font-bold text-slate-800">Text Extraction:</p>
                    <p>Extracts all plain text from your PDF using client-side PDF.js rendering.</p>
                  </div>
                )}
              </div>
      )}
    </div>
  );
}
