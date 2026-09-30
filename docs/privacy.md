# Privacy

The browser extracts PDF text and stores the original PDF, metadata, and page text in IndexedDB. Library operations and reading do not upload book files to the backend.

When a user asks a book-specific AI question, local keyword retrieval selects matching page excerpts. The question and selected excerpts are sent through FastAPI to Groq. The original PDF and unselected pages are not included. The Groq credential remains backend-only. Questions, answers, and citations are saved in local IndexedDB and remain available on the same browser profile. Clearing browser site data deletes this history. A database migration removes the discontinued imported-discussion store from existing browser profiles.

## Automatic anonymous analytics

The browser automatically sends one of three event names (`daily_visit`, `question`, `book_upload`) and a random ID rotated daily. These count daily active browsers, submitted questions, and successful PDF imports. It does not send question/answer text, book titles, filenames, PDFs, or account identity. The server rejects undeclared event fields. The hosting provider necessarily receives network request metadata such as the connecting IP address and may retain it in its own logs; this is separate from the analytics database.

The backend stores daily aggregate counters and a hash of the random daily ID solely to count each browser once per UTC day. Those hashes are removed when an event for a later day arrives; daily aggregate totals remain. Without accounts, this measures unique browser profiles per day, not verified people, and the same person using multiple devices may count more than once. Analytics reporting is protected by a backend-only admin token. Production can store these analytics-only records in Supabase PostgreSQL using the backend secret `SUPABASE_DATABASE_URL`; local development defaults to SQLite. With Supabase Free, project inactivity and database quotas apply, and those terms may change.