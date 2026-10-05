from datetime import datetime
from typing import ClassVar, Literal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Concept(Base):
    """Represents a concept/entity extracted from books (e.g., 'artificial intelligence', 'philosophy', 'character name')"""
    __tablename__ = 'concepts'
    __table_args__: ClassVar[tuple[object, ...]] = (
        Index('ix_concepts_name', 'name'),
        Index('ix_concepts_type', 'concept_type'),
        UniqueConstraint('name', 'concept_type', name='uq_concepts_name_type'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    concept_type: Mapped[str] = mapped_column(String(50), nullable=False)  # PERSON, PLACE, CONCEPT, THEME, ENTITY, TOPIC
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class BookConcept(Base):
    """Links a book to a concept with relevance score and context"""
    __tablename__ = 'book_concepts'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('book_id', 'concept_id', name='uq_book_concept'),
        Index('ix_book_concepts_book_id', 'book_id'),
        Index('ix_book_concepts_concept_id', 'concept_id'),
        Index('ix_book_concepts_relevance', 'relevance_score'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    book_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    concept_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('concepts.id', ondelete='CASCADE'), nullable=False)
    relevance_score: Mapped[float] = mapped_column(nullable=False, default=0.0)  # 0.0 to 1.0
    mention_count: Mapped[int] = mapped_column(nullable=False, default=0)
    context_snippets: Mapped[str | None] = mapped_column(Text)  # JSON array of text snippets where concept appears
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BookRelationship(Base):
    """Represents a relationship between two books based on shared concepts"""
    __tablename__ = 'book_relationships'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('book_id_1', 'book_id_2', 'relationship_type', name='uq_book_relationship'),
        CheckConstraint('book_id_1 != book_id_2', name='ck_books_not_same'),
        Index('ix_book_relationships_book_1', 'book_id_1'),
        Index('ix_book_relationships_book_2', 'book_id_2'),
        Index('ix_book_relationships_strength', 'strength'),
        Index('ix_book_relationships_type', 'relationship_type'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    book_id_1: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    book_id_2: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False)  # SHARED_CONCEPTS, SIMILAR_THEMES, SAME_AUTHOR, SEQUEL, RELATED_TOPICS
    strength: Mapped[float] = mapped_column(nullable=False, default=0.0)  # 0.0 to 1.0
    shared_concept_count: Mapped[int] = mapped_column(nullable=False, default=0)
    shared_concepts: Mapped[str | None] = mapped_column(Text)  # JSON array of shared concept IDs
    description: Mapped[str | None] = mapped_column(Text)  # AI-generated description of the relationship
    is_notified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class UserNote(Base):
    """User's personal notes, reviews, summaries, opinions about a book"""
    __tablename__ = 'user_notes'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("note_type IN ('REVIEW', 'SUMMARY', 'OPINION', 'QUESTION', 'THOUGHT')", name='ck_user_notes_type'),
        Index('ix_user_notes_user_id', 'user_id'),
        Index('ix_user_notes_book_id', 'book_id'),
        Index('ix_user_notes_type', 'note_type'),
        Index('ix_user_notes_created_at', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    note_type: Mapped[str] = mapped_column(String(16), nullable=False)  # REVIEW, SUMMARY, OPINION, QUESTION, THOUGHT
    title: Mapped[str | None] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default='true')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class NoteConcept(Base):
    """Links a user note to concepts mentioned in it"""
    __tablename__ = 'note_concepts'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('note_id', 'concept_id', name='uq_note_concept'),
        Index('ix_note_concepts_note_id', 'note_id'),
        Index('ix_note_concepts_concept_id', 'concept_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    note_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('user_notes.id', ondelete='CASCADE'), nullable=False)
    concept_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('concepts.id', ondelete='CASCADE'), nullable=False)
    relevance_score: Mapped[float] = mapped_column(nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BookComparisonNotification(Base):
    """Notifications for book relationships and comparisons"""
    __tablename__ = 'book_comparison_notifications'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'DISMISSED')", name='ck_comparison_notif_status'),
        Index('ix_comparison_notif_user_id', 'user_id'),
        Index('ix_comparison_notif_status', 'status'),
        Index('ix_comparison_notif_relationship_id', 'relationship_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    relationship_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('book_relationships.id', ondelete='CASCADE'), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='PENDING', server_default='PENDING')
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChatSession(Base):
    """Chat sessions for cross-book queries"""
    __tablename__ = 'chat_sessions'
    __table_args__: ClassVar[tuple[object, ...]] = (
        Index('ix_chat_sessions_user_id', 'user_id'),
        Index('ix_chat_sessions_book_id', 'book_id'),
        Index('ix_chat_sessions_created_at', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='SET NULL'))
    title: Mapped[str | None] = mapped_column(String(300))
    is_cross_book: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    """Individual messages in a chat session"""
    __tablename__ = 'chat_messages'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("role IN ('user', 'assistant', 'system')", name='ck_chat_messages_role'),
        Index('ix_chat_messages_session_id', 'session_id'),
        Index('ix_chat_messages_created_at', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[str | None] = mapped_column(Text)  # JSON array of citations
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())