<div align="center">

# 📄 Docify

### Enterprise-Grade AI-Powered Document Optimization, Vector Mutation & Semantic Analytics Platform

**Docify** is a high-performance, full-stack document processing ecosystem engineered to convert, edit, compress, organize, and analyze PDFs and unstructured documents. By decoupling heavy binary stream mutation pipelines from primary web server threads, the framework handles complex multi-format transcoding, structural file optimization, and Retrieval-Augmented Generation (RAG) analysis smoothly without thread blocks or UI latency.

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
</p>

<p align="center">
  <a href="https://github.com/shreeharsh-patil/Docify/stargazers"><img alt="Stars" src="https://badgen.net/github/stars/shreeharsh-patil/Docify?color=000000&icon=github"></a>
  <a href="https://github.com/shreeharsh-patil/Docify/issues"><img alt="Issues" src="https://badgen.net/github/issues/shreeharsh-patil/Docify?color=000000&icon=github"></a>
  <a href="LICENSE"><img alt="License" src="https://badgen.net/badge/license/MIT/000000"></a>
</p>

</div>

---

## 🏛️ Architecture & Processing Design Pattern

Standard document platforms drop connections or run out of memory when processing large files, applying complex compressions, or running AI text evaluations. Docify prevents this by using a **Decoupled Job Pipeline**. The Next.js client pushes large byte streams straight to high-throughput worker layers that separate file operations (transcoding, minification) from semantic text loops (vector embeddings, AI scanning).

```mermaid
graph TD
    subgraph "Client Application Space"
        A["🎨 UI Shell interface <br><i>(Next.js App Router / Tailwind)</i>"]
        B["📥 Stream Uploader <br><i>(Chunked File Streaming Handles)</i>"]
    end

    subgraph "Service API Layer"
        C["🔌 System API Interface <br><i>(Express HTTP Server / Actions)</i>"]
        D["⚙️ Binary Mutator Pipeline <br><i>(PDF Compression & Merging)</i>"]
        E["🧠 Semantic Analytics Layer <br><i>(Text Chunking & Tokenizers)</i>"]
    end

    subgraph "Hardware, Storage & LLM AI Mesh"
        F["💾 Metadata Ledger <br><i>(PostgreSQL Database Matrix)</i>"]
        G["🤖 Vector Storage Core <br><i>(Pinecone / PGVector Nodes)</i>"]
        H["💎 LLM Inference Engine <br><i>(OpenAI / Local Model API)</i>"]
    end

    A <-->|User Interaction Vectors| B
    B <-->|Chunked HTTP Form Data| C
    C <-->|ACID Transaction Logs| F
    C <-->|Pipe Binary File Buffers| D
    C <-->|Extract Content Strings| E
    E <-->|Generate Document Vectors| G
    E <-->|Context-Aware Inferences| H

    style A fill:#000000,stroke:#333,stroke-width:2px,color:#fff
    style B fill:#34B7F1,stroke:#209CEE,stroke-width:2px,color:#fff
    style C fill:#9b59b6,stroke:#8e44ad,stroke-width:2px,color:#fff
    style D fill:#e74c3c,stroke:#c0392b,stroke-width:2px,color:#fff
    style E fill:#4E9A06,stroke:#3b7204,stroke-width:2px,color:#fff
    style F fill:#4169E1,stroke:#27ae60,stroke-width:2px,color:#fff
    style G fill:#f1c40f,stroke:#f39c12,stroke-width:2px,color:#333
    style H fill:#fff,stroke:#333,stroke-width:2px,color:#333
```

> [!NOTE]
> **Memory Allocation Design Strategy:** Rather than loading complete document payloads directly into RAM, large files are streamed in uncompressed chunks or mapped as temporary disk allocations during transcoding and minification processes. This keeps the application highly scalable and stable even under heavy usage.

### 🔄 End-to-End Document Processing Lifecycle

The sequence blueprint below shows the decoupled, step-by-step path from initial file upload to structural mutation and semantic AI indexing:

```mermaid
sequenceDiagram
    autonumber
    actor User as Account Owner
    participant UI as Client Interface Dashboard
    participant AP as Backend Core Service
    participant BM as Binary Mutator Engine
    participant SE as Semantic AI Layer
    participant DB as System Databases

    User->>UI: Select PDF Document & Trigger 'Analyze + Compress'
    UI->>AP: Stream File Payload (Multi-part Binary Stream)
    AP->>DB: Open Job Record Tracker (Status: Processing)
    
    rect rgb(20, 30, 20)
        note over AP,BM: Parallel Structural Processing Started
        AP->>BM: Pass File Buffers to Compactor Engine
        BM->>BM: Downsample Asset Images & Re-compress Font Tables
        BM-->>AP: Return Optimized Binary Asset
    end

    rect rgb(30, 20, 40)
        note over AP,SE: Asynchronous Semantic Analysis Window
        AP->>SE: Extract Clean Text Streams (Bypass Layout Markups)
        SE->>SE: Execute Token Window Chunking & Overlay Indices
        SE->>DB: Inject Document Text Embeddings to Vector Stores
    end

    AP->>DB: Finalize Job Record Tracker (Status: Success)
    AP-->>UI: Broadcast Processed Completion Payloads
    UI-->>User: Refresh Interface Components with New Metrics & Download
```

### 🛠️ Production Pipeline Implementation

| Component | The Technical Challenge | Our Solution Architecture |
| :--- | :--- | :--- |
| **📉 Lossless Compression** | Reducing document sizes often compromises embedded text maps or destroys image vectors. | Employs adaptive script wrappers to strip duplicate asset fonts, balance resolution matrices, and optimize internal stream structures. |
| **🛡️ Tokenizer Protection** | Oversized context blocks throw memory limits or drop important details when queried. | Runs text contents through sliding-window chunking algorithms, keeping relative overlap blocks to preserve context integrity. |
| **🧠 Multi-Format Parsing** | Handling mixed inputs (PDFs, DOCX, TXT) across a single layout engine causes schema fragmentation. | Deploys specialized separate parser interfaces that convert incoming assets into unified data objects before saving. |
| **⚡ Non-Blocking Flows** | Running document processing directly on the web server freezes client routing interfaces. | Processes heavy file conversions asynchronously within isolated background tasks, using event listeners to sync client UI updates. |

### 🎨 Interface Showcase

Here is a visual showcase of the Docify interface:

![Docify Interface Showcase](public/dashboard_showcase.jpg)

## 🚀 Deployment & Local Initialization

### Core Framework Dependencies

- **Runtime Sandbox Environment:** Node.js >= 20.x or comparable modern LTS
- **Secondary Compilers:** Python >= 3.10 (Applicable to advanced AI parsing layers)
- **Databases:** PostgreSQL instance (with pgvector enabled) or standalone vector storage cluster
- **Package System:** npm, yarn, or pnpm

### Environment Setup Sequences

#### 1. Repository Instantiation & Dependency Matching

```bash
# Clone the document platform repository source core
git clone https://github.com/shreeharsh-patil/Docify.git
cd Docify

# Install root dependencies across the engine landscape
npm install
```

#### 2. Local Environment Allocation

Configure a root-level `.env` profile with the connection strings and configuration settings shown below:

```ini
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/docify_db?schema=public"
OPENAI_API_KEY="your_secure_openai_api_token"
VECTOR_STORE_URI="your_vector_database_endpoint"
NEXTAUTH_SECRET="your_secure_hash_token_string_here"
```

#### 3. Database Layer Synchronization

```bash
# Push schemas directly to your target database cluster
npx prisma db push # Or standard relational migration commands depending on DB tool choice
```

#### 4. Bootstrap Dev Environment

```bash
npm run dev
# Active Development Engine Sandbox: http://localhost:3000
```

## 📁 Framework Directory Architecture

```
root
├─ app/                             (Next.js App Router: Layout segments & system client interfaces)
│  ├─ (workspace)/                  (File managers, analytical hubs, and workspace directories)
│  ├─ convert/                      (Multi-format conversion engines and drop zone structures)
│  ├─ analyze/                      (AI RAG interfaces, chat prompts, and citation panels)
│  └─ api/                          (API endpoint controllers, stream pipes, and upload routes)
├─ components/                      (Modular Interface Component Bricks)
│  ├─ ui/                           (Atomic layout structures: Buttons, Inputs, Dialogs via shadcn/ui)
│  ├─ upload/                       (Chunked multi-part streaming file submission handlers)
│  └─ viewer/                       (Dynamic layout canvas readers and page reordering grids)
├─ engines/                         (Core Processing Layer - Python / Node Services)
│  ├─ mutator/                      (PDF compressors, font minifiers, and compression scripts)
│  ├─ converter/                    (Document converters: DOCX to PDF, Images to PDF)
│  └─ semantic/                     (AI Processing: Text chunkers, embed managers, and API pipes)
├─ lib/                             (System Connection Bridges)
│  ├─ db.ts                         (Database connection pool bindings)
│  └─ utils.ts                      (Style evaluations and formatting tools)
├─ prisma/                          (Database Configuration)
│  └─ schema.prisma                 (Relational maps: Users, Documents, Jobs, VectorIndexes)
├─ package.json                     (Engine script definitions & core dependency manifests)
└─ README.md                        (Unified platform documentation)
```

## ⚖️ Legal Guidelines & Disclaimer

> [!WARNING]
> This platform is provided under the terms of the MIT License. It operates independently as a custom software engineering platform built for file automation testing, document transformation simulations, and student software engineering portfolio artifact research. The architecture does not implicitly guarantee regulatory data security standard compliances (like HIPAA or GDPR) natively out-of-the-box. Users assume absolute accountability regarding document retention protocols and database validation keys.

## 👤 Project Author

Developed and Maintained by **Shreeharsh Patil**.

Feel free to contact me or submit issues via:
- **Email:** [shreeharsh.dev@gmail.com](mailto:shreeharsh.dev@gmail.com)
- **GitHub Profile:** [github.com/shreeharsh-patil](https://github.com/shreeharsh-patil)
