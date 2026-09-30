# Reading Memory

A local-first personal reading memory. Add PDFs, read extracted text, and ask questions grounded in passages retrieved in your browser.

## Current features

- PDF text extraction in the browser with PDF.js
- Books, original PDF files, and extracted pages stored in IndexedDB on this device
- Book reader with page navigation
- Book-specific questions using local keyword retrieval and page citations
- Questions, answers, and citations saved locally per book and restored on return
- FastAPI AI gateway; only retrieved passages are sent to Groq when configured
- Automatic anonymous daily usage counts for active browsers, submitted questions, and successful PDF imports
- No scanned-PDF OCR, semantic embeddings, account system, or cloud sync yet

## Requirements

- Node.js 20.19+ or 22.12+
- Python 3.11+
- Docker Desktop is optional unless using Compose

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite prints the local URL when ready.

## Run the API

From the repository root, create and activate a virtual environment, then install the development dependencies:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r backend\requirements-dev.txt
cd backend
py -m uvicorn app.main:app --reload
```

The health check is available at `http://127.0.0.1:8000/api/health`.

## Configuration

Copy `backend/.env.example` to `backend/.env`, then set `GROQ_API_KEY` and `GROQ_MODEL` in that backend-only file to enable answers. Restart the API after editing it. Never put the key in frontend code or a `VITE_*` variable. Without the backend key and model, upload and reading still work locally, while Ask this book explains that AI is not configured.

Anonymous usage events are sent automatically to the backend. To view daily metrics, set `ANALYTICS_ADMIN_TOKEN` only in the backend environment (or deployment secret configuration), restart the API, then enter that token under Settings. For direct Uvicorn runs, set it in `backend/.env`; Compose reads it from the shell environment or the root Compose `.env` file. Analytics report daily unique browser profiles, submitted questions, and successful PDF imports. Without accounts, browser profiles are an approximate user count, not verified people. Local runs use SQLite at `backend/data/analytics.sqlite3`; Compose persists SQLite in its named `analytics_data` volume unless `SUPABASE_DATABASE_URL` is set.

The social account foundation uses `DATABASE_URL` for PostgreSQL and `JWT_SECRET` for signed sessions. The account page is at **Account**; register with an email, unique username, display name, and a password of at least 12 characters. When `DATABASE_URL` is set in the backend container, Alembic migrations run at startup. Render should use its PostgreSQL connection URL and set `ENVIRONMENT=production` so session cookies are marked Secure. The local book library remains in IndexedDB and is not automatically uploaded when an account is created.

The browser ranks matching page text locally. For an AI question it sends the question and up to five relevant excerpts (bounded to 9,000 characters) to FastAPI; the original PDF and unrelated pages stay in IndexedDB.

Analytics events are a separate request containing only an event enum and random per-day visitor ID. The API rejects extra fields. It never receives question or answer text, book titles, filenames, or PDF data for analytics. Daily hashes are retained only to deduplicate browsers within a UTC day; aggregate counts remain for reports. The hosting provider may independently log IP addresses and request metadata.

### Free hosting target: Supabase + Render

For a no-persistent-disk deployment, create a Supabase Free project and set its PostgreSQL connection string as the backend-only `SUPABASE_DATABASE_URL` secret in Render. The app creates its analytics tables on startup; only daily totals and hashed daily visitor IDs go into this database. Keep `ANALYTICS_ADMIN_TOKEN` as a separate backend secret. Keep `SUPABASE_DATABASE_URL` out of the frontend and never prefix it with `VITE_`.

Render's Free web service and Supabase's Free database currently have $0 base prices, so the target stack is **Supabase PostgreSQL + Render Free + $0/month within free-tier limits**. This is not an unconditional cost guarantee: Render applies bandwidth and compute limits, and Supabase Free currently pauses projects after one week of inactivity and has a 500 MB database quota. Check both providers' current limits and billing dashboards before public launch. Without `SUPABASE_DATABASE_URL`, the backend continues to use local SQLite, which is not persistent across Render deploys. The deployed frontend must also route `/api` requests to the Render backend.

Conversation history is also stored in IndexedDB on this browser profile, so it remains available when the app is reopened on this device. Clearing site data removes it; cloud sync and export are not implemented yet. Failed or interrupted questions remain visible as retryable entries.

## Docker Compose

```powershell
docker compose up --build
```

The Compose service runs only the API; the Vite frontend is run separately during development.

## Tests and build

```powershell
cd frontend
npm test
npm run build
cd ..
py -m pytest backend\tests
```

## Architecture notes

See [architecture](docs/architecture.md), [API](docs/api.md), [memory model](docs/memory.md), and [privacy](docs/privacy.md).# bookAndChat
# bookAndChat
# bookAndChat
