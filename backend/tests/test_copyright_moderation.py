from app.moderation.copyright import check_copyright
from app.moderation.classifier import classify_content


def test_exact_reproduction_is_blocked():
    source = (
        "The ancient forest was silent beneath the moon. "
        "The river moved slowly through the valley. "
        "Birds rested quietly among the trees."
    )

    result = check_copyright(
        publication_text=source,
        source_text=source,
    )

    assert result.exact_match_score == 1.0
    assert result.matched_ratio == 1.0
    assert result.decision.status == "block"


def test_unrelated_text_is_not_blocked():
    source = (
        "The ancient forest was silent beneath the moon. "
        "The river moved slowly through the valley."
    )

    publication = (
        "Modern computers process information using "
        "electronic circuits and software instructions."
    )

    result = check_copyright(
        publication_text=publication,
        source_text=source,
    )

    assert result.exact_match_score == 0.0
    assert result.matched_ratio == 0.0
    assert result.decision.status == "allow"


def test_classifier_blocks_high_matching_ratio():
    result = classify_content(
        exact_match_score=0.0,
        similarity_score=0.2,
        matched_ratio=0.8,
    )

    assert result.status == "block"


def test_classifier_reviews_moderate_similarity():
    result = classify_content(
        exact_match_score=0.0,
        similarity_score=0.8,
        matched_ratio=0.0,
    )

    assert result.status == "review"
from app.moderation.copyright import check_copyright


def test_truncating_source_can_miss_copied_passage():
    passage = (
        "Quartz lanterns drift quietly beneath violet skies while "
        "silver foxes wander across distant mountains at midnight."
    )

    filler = "cedar meadow amber orchard pebble willow " * 10000
    source = filler + passage

    # Simulate the current frontend behavior.
    truncated_source = source[:100000]

    full_result = check_copyright(
        publication_text=passage,
        source_text=source,
    )

    truncated_result = check_copyright(
        publication_text=passage,
        source_text=truncated_source,
    )

    assert full_result.decision.status == "block"
    assert truncated_result.decision.status == "allow"
