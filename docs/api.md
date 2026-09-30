# API

## `GET /api/health`

Returns `200 OK` with `{"status":"ok"}` when the API process is running. It does not verify an external model provider or database.

## `POST /api/chat`

Accepts a question and up to eight bounded book-page excerpts (at most 9,000 characters total) retrieved in the browser. Empty context returns an insufficient-evidence response without calling Groq. If `GROQ_API_KEY` or `GROQ_MODEL` is missing, it returns `503` with setup guidance.

Retrieved book text is treated as untrusted reference material in the system prompt. The endpoint does not accept or store PDFs. Authentication, quotas, and rate limits are not implemented yet and are required before a public deployment.

## `POST /api/analytics/events`

The frontend sends this automatically for daily visits, submitted questions, and successful PDF imports. The endpoint accepts only `{ "event": "daily_visit" | "question" | "book_upload", "visitor_id": "<random UUID>" }`. Additional fields are rejected. It stores a daily aggregate and a hash of the ID for once-per-day browser counting; it stores no content or book identifiers. The hosting provider can still see network metadata such as IP addresses.

## `GET /api/analytics/daily?days=30`

Returns daily anonymous browser counts, questions, and successful PDF imports for 1–90 days. Requires `Authorization: Bearer <ANALYTICS_ADMIN_TOKEN>`. Configure the token only in the backend environment; the UI holds it in memory for the current session.