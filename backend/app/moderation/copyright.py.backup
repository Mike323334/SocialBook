from dataclasses import dataclass

from .exact_match import calculate_exact_match
from .similarity import cosine_similarity
from .classifier import (
    ModerationDecision,
    classify_content,
)


@dataclass
class CopyrightCheckResult:
    decision: ModerationDecision
    exact_match_score: float
    similarity_score: float
    matched_ratio: float


def calculate_matched_ratio(
    publication_text: str,
    source_text: str,
) -> float:
    """
    Estimate the percentage of publication words
    that also appear in the source.

    This is intentionally conservative and simple.
    """

    publication_words = (
        publication_text.lower().split()
    )

    source_words = set(
        source_text.lower().split()
    )

    if not publication_words:
        return 0.0

    matched_words = sum(
        1
        for word in publication_words
        if word in source_words
    )

    return matched_words / len(publication_words)


def check_copyright(
    publication_text: str,
    source_text: str,
) -> CopyrightCheckResult:
    """
    Run all copyright-related checks.
    """

    exact_match_score = calculate_exact_match(
        publication_text,
        source_text,
    )

    similarity_score = cosine_similarity(
        publication_text,
        source_text,
    )

    matched_ratio = calculate_matched_ratio(
        publication_text,
        source_text,
    )

    decision = classify_content(
        exact_match_score=exact_match_score,
        similarity_score=similarity_score,
        matched_ratio=matched_ratio,
    )

    return CopyrightCheckResult(
        decision=decision,
        exact_match_score=exact_match_score,
        similarity_score=similarity_score,
        matched_ratio=matched_ratio,
    )