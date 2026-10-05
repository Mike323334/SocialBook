import re


def normalize_text(text: str) -> str:
    """
    Normalize text for comparison.

    - Lowercase
    - Remove excessive whitespace
    - Keep punctuation out of the comparison
    """
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def get_word_ngrams(text: str, n: int = 10) -> set[str]:
    """
    Generate word n-grams from text.

    Example:
        "the cat is sitting on the chair"

    with n=3 becomes:
        {
            "the cat is",
            "cat is sitting",
            "is sitting on",
            ...
        }
    """
    normalized = normalize_text(text)
    words = normalized.split()

    if len(words) < n:
        return set()

    return {
        " ".join(words[i:i + n])
        for i in range(len(words) - n + 1)
    }


def calculate_exact_match(
    publication_text: str,
    source_text: str,
    n: int = 10,
) -> float:
    """
    Calculate how much of the publication contains
    exact n-gram matches with the source.

    Returns a value between 0.0 and 1.0.
    """

    publication_ngrams = get_word_ngrams(
        publication_text,
        n,
    )

    source_ngrams = get_word_ngrams(
        source_text,
        n,
    )

    if not publication_ngrams:
        return 0.0

    matches = publication_ngrams.intersection(
        source_ngrams
    )

    return len(matches) / len(publication_ngrams)