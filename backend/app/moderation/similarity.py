import math
import re
from collections import Counter


STOP_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "is",
    "are",
    "was",
    "were",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "that",
    "this",
    "it",
    "as",
    "by",
    "from",
    "be",
    "has",
    "have",
    "had",
    "not",
}


def tokenize(text: str) -> list[str]:
    """
    Convert text into normalized words.
    """

    text = text.lower()

    words = re.findall(
        r"\b[a-zA-Z0-9]+\b",
        text,
    )

    return [
        word
        for word in words
        if word not in STOP_WORDS
    ]


def term_frequency(text: str) -> Counter:
    """
    Calculate word frequency.
    """

    return Counter(tokenize(text))


def cosine_similarity(
    text_a: str,
    text_b: str,
) -> float:
    """
    Calculate cosine similarity between two texts.

    Returns:
        0.0 = completely different
        1.0 = identical word distribution
    """

    vector_a = term_frequency(text_a)
    vector_b = term_frequency(text_b)

    if not vector_a or not vector_b:
        return 0.0

    common_words = set(vector_a) & set(vector_b)

    dot_product = sum(
        vector_a[word] * vector_b[word]
        for word in common_words
    )

    magnitude_a = math.sqrt(
        sum(value ** 2 for value in vector_a.values())
    )

    magnitude_b = math.sqrt(
        sum(value ** 2 for value in vector_b.values())
    )

    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0

    return dot_product / (
        magnitude_a * magnitude_b
    )