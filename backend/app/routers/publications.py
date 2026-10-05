from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models import Book, User
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

    result = check_copyright(
        publication_text=request.content,
        source_text=request.source_text,
    )

    if result.decision.status == "block":
        raise HTTPException(
            status_code=403,
            detail={
                "message": "This publication cannot be published because it appears to reproduce a substantial portion of the source text.",
                "reason": result.decision.reason,
                "score": result.decision.score,
            },
        )

    if result.decision.status == "review":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "This publication requires review before it can be published.",
                "reason": result.decision.reason,
                "score": result.decision.score,
            },
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