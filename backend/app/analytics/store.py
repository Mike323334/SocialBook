from __future__ import annotations

import hashlib
import sqlite3
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    import psycopg


class AnalyticsStore:
    def __init__(self, database_location: str) -> None:
        self.is_postgres = database_location.startswith(('postgres://', 'postgresql://'))
        if self.is_postgres:
            self.database_url = database_location
            self._initialize_postgres()
        else:
            self.database_path = Path(database_location)
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            with closing(self._connect()) as connection:
                connection.executescript(
                    '''
                    CREATE TABLE IF NOT EXISTS daily_metrics (
                        day TEXT PRIMARY KEY,
                        unique_users INTEGER NOT NULL DEFAULT 0,
                        questions INTEGER NOT NULL DEFAULT 0,
                        books_uploaded INTEGER NOT NULL DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS active_daily_visitors (
                        day TEXT NOT NULL,
                        visitor_hash TEXT NOT NULL,
                        PRIMARY KEY (day, visitor_hash)
                    );
                    '''
                )

    def record_event(self, event: str, visitor_id: UUID, event_day: date | None = None) -> None:
        day = event_day or datetime.now(timezone.utc).date()
        visitor_hash = hashlib.sha256(visitor_id.bytes).hexdigest()
        metric_column = {
            'question': 'questions',
            'book_upload': 'books_uploaded',
        }.get(event)

        if self.is_postgres:
            with self._connect_postgres() as connection:
                connection.execute('DELETE FROM active_daily_visitors WHERE day <> %s', (day,))
                connection.execute(
                    'INSERT INTO daily_metrics (day) VALUES (%s) ON CONFLICT (day) DO NOTHING',
                    (day,),
                )
                inserted = connection.execute(
                    '''
                    INSERT INTO active_daily_visitors (day, visitor_hash)
                    VALUES (%s, %s)
                    ON CONFLICT (day, visitor_hash) DO NOTHING
                    RETURNING visitor_hash
                    ''',
                    (day, visitor_hash),
                ).fetchone()
                if inserted:
                    connection.execute(
                        'UPDATE daily_metrics SET unique_users = unique_users + 1 WHERE day = %s',
                        (day,),
                    )
                if metric_column:
                    connection.execute(
                        f'UPDATE daily_metrics SET {metric_column} = {metric_column} + 1 WHERE day = %s',
                        (day,),
                    )
            return

        day_text = day.isoformat()
        with closing(self._connect()) as connection:
            connection.execute('BEGIN IMMEDIATE')
            try:
                connection.execute('DELETE FROM active_daily_visitors WHERE day <> ?', (day_text,))
                connection.execute(
                    'INSERT OR IGNORE INTO daily_metrics (day) VALUES (?)',
                    (day_text,),
                )
                inserted = connection.execute(
                    'INSERT OR IGNORE INTO active_daily_visitors (day, visitor_hash) VALUES (?, ?)',
                    (day_text, visitor_hash),
                ).rowcount
                if inserted:
                    connection.execute(
                        'UPDATE daily_metrics SET unique_users = unique_users + 1 WHERE day = ?',
                        (day_text,),
                    )

                if metric_column:
                    connection.execute(
                        f'UPDATE daily_metrics SET {metric_column} = {metric_column} + 1 WHERE day = ?',
                        (day_text,),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    def get_daily_metrics(self, start_day: date, end_day: date) -> list[dict[str, int | str]]:
        if self.is_postgres:
            with self._connect_postgres() as connection:
                rows = connection.execute(
                    '''
                    SELECT day, unique_users, questions, books_uploaded
                    FROM daily_metrics
                    WHERE day >= %s AND day <= %s
                    ORDER BY day ASC
                    ''',
                    (start_day, end_day),
                ).fetchall()
            return [
                {
                    'date': row['day'].isoformat(),
                    'users': row['unique_users'],
                    'questions': row['questions'],
                    'books_uploaded': row['books_uploaded'],
                }
                for row in rows
            ]

        with closing(self._connect()) as connection:
            rows = connection.execute(
                '''
                SELECT day, unique_users, questions, books_uploaded
                FROM daily_metrics
                WHERE day >= ? AND day <= ?
                ORDER BY day ASC
                ''',
                (start_day.isoformat(), end_day.isoformat()),
            ).fetchall()
        return [
            {
                'date': row['day'],
                'users': row['unique_users'],
                'questions': row['questions'],
                'books_uploaded': row['books_uploaded'],
            }
            for row in rows
        ]

    def _initialize_postgres(self) -> None:
        with self._connect_postgres() as connection:
            connection.execute(
                '''
                CREATE TABLE IF NOT EXISTS daily_metrics (
                    day DATE PRIMARY KEY,
                    unique_users INTEGER NOT NULL DEFAULT 0,
                    questions INTEGER NOT NULL DEFAULT 0,
                    books_uploaded INTEGER NOT NULL DEFAULT 0
                )
                '''
            )
            connection.execute(
                '''
                CREATE TABLE IF NOT EXISTS active_daily_visitors (
                    day DATE NOT NULL,
                    visitor_hash TEXT NOT NULL,
                    PRIMARY KEY (day, visitor_hash)
                )
                '''
            )

    def _connect_postgres(self) -> psycopg.Connection:
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(
            self.database_url,
            row_factory=dict_row,
            prepare_threshold=None,
        )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection