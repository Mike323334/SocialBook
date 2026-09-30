# Architecture

## Current boundary

The repository contains a Vite React client and a stateless FastAPI API. PDF parsing and page storage happen in the browser; FastAPI is the controlled boundary for AI requests.

## Intended local-first direction

PDF.js extracts selectable page text in the browser. Dexie/IndexedDB stores the original PDF, document metadata, extracted pages, and book conversations. Initial retrieval uses bounded local keyword matching over the open book. FastAPI validates and forwards only the question and selected page excerpts to Groq; it never receives the complete PDF. Anonymous usage events are sent to FastAPI and stored as daily aggregates. Semantic embeddings, cross-book retrieval, provider abstraction, and vector stores remain deferred until implemented phases need them.

## Current structure

- `frontend/src/db/`: IndexedDB schema
- `frontend/src/features/books/`: local PDF import, library, and reader
- `frontend/src/features/chat/`: local retrieval, chat API client, and book question panel
- `backend/app/api/`: HTTP routes
- `backend/app/llm/`: Groq request boundary
- `backend/app/core/`: backend configuration
- `backend/tests/`: API and configuration tests
- `docs/`: architecture, API, memory, and privacy decisions

## Deferred

OCR for scanned PDFs, semantic embeddings, notes and highlights, saved question history, cross-book personal-memory retrieval, authentication, vector databases, sync, and graph modeling are not implemented yet.