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
    n: int = 5,
) -> float:
    """
    Estimate the proportion of publication words that belong
    to matching sequences of at least n consecutive words.

    Individual shared words do not count as evidence of copying.
    """
    import re

    publication_words = re.findall(
        r"\b\w+\b",
        publication_text.lower(),
    )

    source_words = re.findall(
        r"\b\w+\b",
        source_text.lower(),
    )

    if len(publication_words) < n:
        return 0.0

    source_ngrams = {
        tuple(source_words[i:i + n])
        for i in range(len(source_words) - n + 1)
    }

    matched_positions = set()

    for i in range(len(publication_words) - n + 1):
        phrase = tuple(publication_words[i:i + n])

        if phrase in source_ngrams:
            matched_positions.update(range(i, i + n))

    return len(matched_positions) / len(publication_words)

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