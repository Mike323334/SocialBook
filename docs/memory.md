# Personal memory

The browser stores books and extracted pages in IndexedDB. Each book can have multiple local conversations, listed by their first question in the reader's chat sidebar. Questions, answers, statuses, and citations are stored as ordered messages in each conversation. Selecting a conversation or reopening the book restores that thread.

The schema uses stable IDs and explicit document/conversation references so that future notes, highlights, and concepts can link to existing reading history without coupling the UI to storage. New app conversations receive a title from the first question. Pending questions left by a closed or interrupted session are marked failed and can be retried. Removing a book removes its pages and app conversations in one local transaction. A database migration removes the discontinued imported-discussion store.

Database schema changes are versioned with Dexie migrations. Test migrations and deletion behavior before introducing sync or export.