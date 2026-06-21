# 🧾 Docify PDF Suite — Product Requirements Document (PRD)

## 1. Overview
**Docify PDF Suite** is a client-side PDF utility application modeled on the layout and utility features of `ilovepdf.com`. It provides real-time, browser-native PDF processing (merging, splitting, rotating, organizing, signing, watermarking, protecting, and image-compiling) without server dependencies. All file data is processed locally in the user's browser, maximizing security and privacy.

---

## 2. Core Feature Requirements

### A. Dashboard & Grid Layout
*   **Grid of Tools**: Visual grid of PDF utility cards styled in the iconic Docify red brand theme.
*   **Header navigation**: Clean logo, utility menu, and quick toggle back to the dashboard.
*   **Responsive Flow**: Mobile-friendly grids adapting from 1 to 4 columns.

### B. PDF Processing Tools (Native Client-Side via `pdf-lib`)
*   **Merge PDF**: Upload multiple PDFs, drag-and-drop to reorder pages/files, and merge them into a single PDF.
*   **Split PDF**: Upload a PDF, define page ranges (e.g. 1-3, 4-6), and extract them into separate PDFs.
*   **Rotate PDF**: Upload a PDF, rotate pages (90°, 180°, 270°), and export.
*   **Organize PDF**: View pages as cards, drag-and-drop to reorder, delete specific pages, and download the organized file.
*   **Watermark PDF**: Apply overlay text with font size, color, opacity, and positioning variables to all pages.
*   **Protect PDF**: Secure PDFs by applying password protection restrictions.
*   **Sign PDF**: Open a sketch-pad, draw custom signatures, specify target page and placement coordinates, and embed the signature into the document.
*   **JPG to PDF**: Upload one or more JPG/PNG files, configure page sizing (A4, Letter), margins, orientation, and compile into a single PDF document.

### C. Drag-and-Drop Dropzones
*   **Multi-File Dropzone**: Clean, animated drag-and-drop panel.
*   **File List Panel**: Visual thumbnail representation of uploaded files with individual deletion and ordering control.

### D. Sidebar Option Panels
*   **Config Sidebar**: Slide-out panels on the right side of the screen when files are uploaded, providing custom parameters per tool (e.g., password input, watermark fields, coordinate numbers).

### E. Download Success Portal
*   **Auto-Download**: Seamlessly triggers browser file saving upon processing compilation.
*   **Delightful Feedback**: Celebratory animations (confetti) and direct "Download PDF" links.

---

## 3. Technology Stack

| Layer | Choice |
|---|---|
| **Framework** | Next.js 14+ (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS + Custom CSS (Red-branded branding) |
| **PDF Processing** | `pdf-lib` (client-side binary stream modifier) |
| **Components** | React hooks, Lucide Icons, Canvas API |

---

## 4. UI/UX Guidelines
*   **Primary Palette**: Crimson Red (`#e31c1c` to `#ff3333`) + Clean Slate (`#f8fafc` to `#ffffff`).
*   **Layout Style**: Clean, high-contrast light mode workspace with distinct card outlines and subtle shadow elevation.
*   **Interactive Feedback**: Progression bar indicators, transition animations, and interactive drag-and-drop lists.
