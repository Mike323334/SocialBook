from dataclasses import dataclass
from typing import Literal


ModerationStatus = Literal[
    "allow",
    "review",
    "block",
]


@dataclass
class ModerationDecision:
    status: ModerationStatus
    score: float
    reason: str


def classify_content(
    exact_match_score: float,
    similarity_score: float,
    matched_ratio: float,
) -> ModerationDecision:
    """
    Classify a publication using deterministic signals.

    These thresholds are engineering heuristics,
    not legal definitions of copyright infringement.
    """

    # Strong evidence of substantial reproduction.
    if (
        exact_match_score >= 0.70
        or matched_ratio >= 0.70
    ):
        return ModerationDecision(
            status="block",
            score=max(
                exact_match_score,
                matched_ratio,
            ),
            reason="The publication appears to reproduce a substantial portion of the source text.",
        )

    # Moderate evidence. Send to review / second-stage classifier.
    if (
        exact_match_score >= 0.30
        or matched_ratio >= 0.30
        or similarity_score >= 0.75
    ):
        return ModerationDecision(
            status="review",
            score=max(
                exact_match_score,
                matched_ratio,
                similarity_score,
            ),
            reason="The publication has significant similarity to the source material.",
        )

    # Mostly original content.
    return ModerationDecision(
        status="allow",
        score=max(
            exact_match_score,
            matched_ratio,
            similarity_score,
        ),
        reason="No substantial reproduction was detected.",
    )