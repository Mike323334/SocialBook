from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models import Book, Post, Profile, User
from app.moderation.copyright import check_copyright


router = APIRouter(
    prefix="/publications",
    tags=["publications"],
)


class PublicationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    book_id: UUID
    post_type: str = Field(min_length=1, max_length=16)
    content: str = Field(min_length=1)
    source_text: str = Field(min_length=1)


class PublicationModerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    source_text: str


class CommunityNoteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    book_title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1, max_length=20000)
    source_text: str = Field(min_length=1)


class CommunityNoteVisibilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_published: bool


def moderate_note(content: str, source_text: str):
    if not content.strip():
        raise HTTPException(
            status_code=400,
            detail="Note content cannot be empty.",
        )

    if not source_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Source text cannot be empty.",
        )

    result = check_copyright(
        publication_text=content,
        source_text=source_text,
    )

    print(
    "COPYRIGHT MODERATION:",
    {
        "content_length": len(content),
        "source_length": len(source_text),
        "exact_match": result.exact_match_score,
        "similarity": result.similarity_score,
        "matched_ratio": result.matched_ratio,
        "decision": result.decision.status,
        "score": result.decision.score,
        "reason": result.decision.reason,
    },
)

    if result.decision.status == "block":
        raise HTTPException(
            status_code=403,
            detail={
                "message": (
                    "This note cannot be published because it appears "
                    "to reproduce a substantial portion of the source text."
                ),
                "reason": result.decision.reason,
                "score": result.decision.score,
            },
        )

    if result.decision.status == "review":
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "This note requires review before it can be published."
                ),
                "reason": result.decision.reason,
                "score": result.decision.score,
            },
        )

    return result


def community_note_response(
    post: Post,
    book: Book,
    profile: Profile,
    current_user_id: UUID,
):
    return {
        "id": str(post.id),
        "book_title": book.title,
        "content": post.content,
        "nickname": profile.display_name or profile.username,
        "username": profile.username,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "is_published": post.visibility == "PUBLIC",
        "is_owner": post.user_id == current_user_id,
    }


@router.post("")
def create_publication(
    request: PublicationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    book = db.scalar(
        select(Book).where(
            Book.id == request.book_id,
            Book.owner_id == current_user.id,
        )
    )

    if book is None:
        raise HTTPException(
            status_code=404,
            detail="Book not found.",
        )

    result = moderate_note(
        request.content,
        request.source_text,
    )

    return {
        "status": "allowed",
        "message": "Publication passed copyright moderation.",
        "book_id": str(book.id),
        "moderation": {
            "status": result.decision.status,
            "score": result.decision.score,
            "reason": result.decision.reason,
        },
    }


@router.post("/community", status_code=201)
def publish_community_note(
    request: CommunityNoteCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = request.content.strip()
    book_title = request.book_title.strip()

    if not book_title or not content:
        raise HTTPException(
            status_code=400,
            detail="Book title and note content are required.",
        )

    result = moderate_note(
        content,
        request.source_text,
    )

    profile = db.scalar(
        select(Profile).where(
            Profile.user_id == current_user.id,
        )
    )

    if profile is None:
        raise HTTPException(
            status_code=400,
            detail="Your account profile could not be found.",
        )

    book = db.scalar(
        select(Book).where(
            Book.owner_id == current_user.id,
            Book.title == book_title,
        )
    )

    if book is None:
        book = Book(
            owner_id=current_user.id,
            title=book_title,
        )
        db.add(book)
        db.flush()

    post = Post(
        user_id=current_user.id,
        book_id=book.id,
        post_type="THOUGHT",
        content=content,
        visibility="PUBLIC",
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        **community_note_response(
            post,
            book,
            profile,
            current_user.id,
        ),
        "moderation": {
            "status": result.decision.status,
            "score": result.decision.score,
            "reason": result.decision.reason,
        },
    }


@router.get("/community")
def get_community_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(Post, Book, Profile)
        .join(Book, Post.book_id == Book.id)
        .join(Profile, Profile.user_id == Post.user_id)
        .where(Post.visibility == "PUBLIC")
        .order_by(Post.created_at.desc())
        .limit(200)
    ).all()

    return [
        community_note_response(
            post,
            book,
            profile,
            current_user.id,
        )
        for post, book, profile in rows
    ]


@router.patch("/community/{post_id}")
def update_community_note_visibility(
    post_id: UUID,
    request: CommunityNoteVisibilityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.scalar(
        select(Post).where(
            Post.id == post_id,
            Post.user_id == current_user.id,
        )
    )

    if post is None:
        raise HTTPException(
            status_code=404,
            detail="Your note was not found.",
        )

    post.visibility = (
        "PUBLIC" if request.is_published else "PRIVATE"
    )

    db.commit()

    return {
        "id": str(post.id),
        "is_published": post.visibility == "PUBLIC",
        "message": (
            "Note published."
            if request.is_published
            else "Note is now private."
        ),
    }


@router.delete("/community/{post_id}", status_code=204)
def delete_community_note(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = db.scalar(
        select(Post).where(
            Post.id == post_id,
            Post.user_id == current_user.id,
        )
    )

    if post is None:
        raise HTTPException(
            status_code=404,
            detail="Your note was not found.",
        )

    db.delete(post)
    db.commit()


@router.post("/moderate")
def moderate_publication(
    request: PublicationModerationRequest,
):
    if not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Publication text cannot be empty.",
        )

    if not request.source_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Source text cannot be empty.",
        )

    result = check_copyright(
        publication_text=request.text,
        source_text=request.source_text,
    )

    return {
        "status": result.decision.status,
        "score": result.decision.score,
        "reason": result.decision.reason,
        "metrics": {
            "exact_match": result.exact_match_score,
            "similarity": result.similarity_score,
            "matched_ratio": result.matched_ratio,
        },
    }
