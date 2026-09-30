from typing import Literal, Self

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from app.core.config import Settings, get_settings
from app.llm.groq import answer_from_context

router = APIRouter(prefix='/api', tags=['chat'])


class ChatContext(BaseModel):
    source_type: Literal['book_page'] = 'book_page'
    document_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    page_number: int | None = Field(default=None, ge=1)
    text: str = Field(min_length=1, max_length=3000)
    score: float = Field(ge=0, le=1)

    @model_validator(mode='after')
    def validate_source_metadata(self) -> Self:
        if self.page_number is None:
            raise ValueError('Book page context requires a page number.')
        return self


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    context: list[ChatContext] = Field(max_length=8)

    @model_validator(mode='after')
    def validate_context_budget(self) -> Self:
        if sum(len(item.text) for item in self.context) > 9000:
            raise ValueError('Retrieved context exceeds the request budget.')
        return self


class Citation(BaseModel):
    source_type: Literal['book_page']
    document_id: str
    title: str
    page_number: int | None
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]


@router.post('/chat', response_model=ChatResponse)
async def chat(request: ChatRequest, settings: Settings = Depends(get_settings)) -> ChatResponse:
    if not request.context:
        return ChatResponse(answer="I don't have enough relevant text from this book to answer that yet.", citations=[])

    formatted_sources = []
    for index, item in enumerate(request.context, start=1):
        source_description = f'Book passage: {item.title}, page {item.page_number}'
        formatted_sources.append(f'[S{index}] {source_description}\n{item.text}')
    formatted_context = '\n\n'.join(formatted_sources)
    answer = await answer_from_context(settings, request.question.strip(), formatted_context)
    citations = [
        Citation(
            source_type=item.source_type,
            document_id=item.document_id,
            title=item.title,
            page_number=item.page_number,
            score=item.score,
        )
        for item in request.context
    ]
    return ChatResponse(answer=answer, citations=citations)