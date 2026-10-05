
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.llm.groq import analyze_book_relationship


router = APIRouter(
    prefix="/api/memory",
    tags=["memory"],
)


# ============================================================
# REQUEST
# ============================================================

class RelationshipRequest(BaseModel):
    queryBook: str
    queryPage: int
    queryPassage: str

    matchedBook: str
    matchedPage: int
    matchedPassage: str

    similarity: float = Field(
        ge=-1.0,
        le=1.0,
    )


# ============================================================
# RESPONSE
# ============================================================

class RelationshipResponse(BaseModel):
    meaningful: bool

    explanation: str

    connection: str

    bookAContribution: str

    bookBContribution: str

    importantDifference: str

    whyItMatters: str

    sharedConcepts: List[str]


# ============================================================
# ANALYZE RELATIONSHIP
# ============================================================

@router.post(
    "/analyze-relationship",
    response_model=RelationshipResponse,
)
async def analyze_relationship(
    request: RelationshipRequest,
):
    try:

        result = await analyze_book_relationship(
            query_book=request.queryBook,
            query_page=request.queryPage,
            query_passage=request.queryPassage,
            matched_book=request.matchedBook,
            matched_page=request.matchedPage,
            matched_passage=request.matchedPassage,
            similarity=request.similarity,
        )


        return RelationshipResponse(
            meaningful=result["meaningful"],

            explanation=result[
                "explanation"
            ],

            connection=result[
                "connection"
            ],

            bookAContribution=result[
                "bookAContribution"
            ],

            bookBContribution=result[
                "bookBContribution"
            ],

            importantDifference=result[
                "importantDifference"
            ],

            whyItMatters=result[
                "whyItMatters"
            ],

            sharedConcepts=result[
                "sharedConcepts"
            ],
        )


    except Exception as error:

        print(
            "Relationship analysis failed:",
            error,
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to analyze book relationship.",
        )

