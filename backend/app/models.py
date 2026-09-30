from datetime import datetime
from typing import ClassVar
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = 'users'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("email = lower(email)", name='ck_users_email_lowercase'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Profile(Base):
    __tablename__ = 'profiles'
    __table_args__: ClassVar[tuple[object, ...]] = (
        Index('ix_profiles_username', 'username', unique=True),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    bio: Mapped[str] = mapped_column(String(500), nullable=False, default='', server_default='')
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class Book(Base):
    __tablename__ = 'books'

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    source_document_id: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    author: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Post(Base):
    __tablename__ = 'posts'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("post_type IN ('REVIEW', 'THOUGHT', 'QUESTION')", name='ck_posts_post_type'),
        CheckConstraint("visibility IN ('PRIVATE', 'FOLLOWERS', 'PUBLIC')", name='ck_posts_visibility'),
        CheckConstraint("post_type != 'QUESTION' OR ai_question IS NOT NULL", name='ck_posts_question_text'),
        Index('ix_posts_user_id', 'user_id'),
        Index('ix_posts_book_id', 'book_id'),
        Index('ix_posts_post_type', 'post_type'),
        Index('ix_posts_visibility', 'visibility'),
        Index('ix_posts_created_at', 'created_at'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    book_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('books.id', ondelete='CASCADE'), nullable=False)
    post_type: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default='', server_default='')
    ai_question: Mapped[str | None] = mapped_column(Text)
    ai_answer: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default='PRIVATE', server_default='PRIVATE')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class Comment(Base):
    __tablename__ = 'comments'
    __table_args__: ClassVar[tuple[object, ...]] = (
        Index('ix_comments_post_id', 'post_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    post_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('posts.id', ondelete='CASCADE'), nullable=False)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class Like(Base):
    __tablename__ = 'likes'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('user_id', 'post_id', name='uq_likes_user_post'),
        Index('ix_likes_post_id', 'post_id'),
        Index('ix_likes_user_id', 'user_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    post_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('posts.id', ondelete='CASCADE'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Follow(Base):
    __tablename__ = 'follows'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('follower_id', 'following_id', name='uq_follows_pair'),
        CheckConstraint('follower_id != following_id', name='ck_follows_not_self'),
        Index('ix_follows_follower_id', 'follower_id'),
        Index('ix_follows_following_id', 'following_id'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    follower_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    following_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Notification(Base):
    __tablename__ = 'notifications'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("type IN ('LIKE', 'COMMENT', 'FOLLOW')", name='ck_notifications_type'),
        Index('ix_notifications_user_id', 'user_id'),
        Index('ix_notifications_is_read', 'is_read'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    actor_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type: Mapped[str] = mapped_column('type', String(16), nullable=False)
    post_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey('posts.id', ondelete='CASCADE'))
    comment_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey('comments.id', ondelete='CASCADE'))
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Report(Base):
    __tablename__ = 'reports'
    __table_args__: ClassVar[tuple[object, ...]] = (
        CheckConstraint("target_type IN ('POST', 'COMMENT', 'USER')", name='ck_reports_target_type'),
        CheckConstraint("reason IN ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'MISINFORMATION', 'COPYRIGHT', 'OTHER')", name='ck_reports_reason'),
        CheckConstraint("status IN ('OPEN', 'RESOLVED', 'DISMISSED')", name='ck_reports_status'),
        Index('ix_reports_status', 'status'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)
    target_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='OPEN', server_default='OPEN')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Block(Base):
    __tablename__ = 'blocks'
    __table_args__: ClassVar[tuple[object, ...]] = (
        UniqueConstraint('blocker_id', 'blocked_id', name='uq_blocks_pair'),
        CheckConstraint('blocker_id != blocked_id', name='ck_blocks_not_self'),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    blocker_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    blocked_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())