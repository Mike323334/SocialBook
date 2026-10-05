
import json
import os
from typing import Any

from dotenv import load_dotenv
from groq import AsyncGroq


load_dotenv()


GROQ_API_KEY = os.getenv("GROQ_API_KEY")

GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "llama-3.3-70b-versatile",
)


if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY environment variable is not configured."
    )


client = AsyncGroq(
    api_key=GROQ_API_KEY,
)


# ============================================================
# EXISTING BOOK Q&A
# ============================================================

CHAT_SYSTEM_PROMPT = """
You are a helpful assistant answering questions about a book.

Answer ONLY from the evidence supplied by the application.

Do not use outside knowledge.

If the evidence does not contain enough information to answer the
question, clearly say that the provided passages do not contain enough
information.

When using evidence, cite the relevant source using the citation format
provided by the application, such as [S1], [S2].

Be concise and accurate.
"""


async def answer_from_context(
    question: str,
    context: str,
) -> str:
    """
    Answer a user's question using retrieved book passages.
    """

    user_prompt = f"""
Answer the following question using ONLY the supplied book evidence.

QUESTION:
{question}

BOOK EVIDENCE:
{context}

Remember:

- Use only the supplied evidence.
- Do not invent information.
- If the evidence is insufficient, say so.
- Include citations such as [S1] when appropriate.
"""

    response = await client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0,
        max_tokens=1000,
        messages=[
            {
                "role": "system",
                "content": CHAT_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError(
            "Groq returned an empty response."
        )

    return content


# ============================================================
# CROSS-BOOK RELATIONSHIP ANALYSIS
# ============================================================

RELATIONSHIP_SYSTEM_PROMPT = """
You analyze relationships between passages from different books.

Your job is to determine whether the passages have a meaningful
conceptual relationship.

Do NOT decide that passages are related merely because they contain
similar words.

A meaningful relationship can be:

- the same security vulnerability
- the same underlying concept
- cause and effect
- problem and solution
- principle and practical implementation
- different explanations of the same phenomenon
- complementary approaches to the same problem
- contrasting approaches to the same issue
- one passage adding an important dimension to the other

A weak relationship includes:

- generic words appearing in both passages
- unrelated uses of the same technical terminology
- both passages being broadly about "security" without a specific link
- superficial vocabulary similarity

You must carefully compare the actual ideas expressed in both passages.

IMPORTANT:

Every explanatory field must contain useful, substantive content when
the relationship is meaningful.

Do not leave fields empty.

If a field cannot be strongly supported, explain the limitation rather
than returning an empty string.

Return ONLY valid JSON.

The JSON MUST have exactly these fields:

{
  "meaningful": true,
  "explanation": "...",
  "connection": "...",
  "bookAContribution": "...",
  "bookBContribution": "...",
  "importantDifference": "...",
  "whyItMatters": "...",
  "sharedConcepts": [
    "...",
    "..."
  ]
}

FIELD REQUIREMENTS:

meaningful:
Boolean indicating whether the relationship is genuinely meaningful.

explanation:
Explain specifically what the two passages have in common.
Do not simply say that they discuss the same topic.

connection:
Explain the mechanism or conceptual bridge connecting the passages.
Explain HOW the ideas connect.

bookAContribution:
Explain what contributes to the relationship.
Identify the specific idea, explanation, technique, cause, risk, principle,
or perspective that provides.

bookBContribution:
Explain what contributes to the relationship.
Identify the specific idea, explanation, technique, cause, risk, principle,
or perspective that  provides.

importantDifference:
Explain an important difference in how the passages approach the subject.
If they are very similar, explain the meaningful distinction that remains,
such as emphasis, level of detail, perspective, or practical focus.

whyItMatters:
Explain why comparing these passages provides additional understanding.
The answer should explain the value of the connection rather than simply
repeating that they are related.

sharedConcepts:
List specific concepts supported by BOTH passages.
Do not list generic words such as:
"security", "system", "people", "technology", or "information"
unless the passages clearly make those concepts central.

CRITICAL RULE:

Use ONLY information supported by the two supplied passages.

Do not use outside knowledge to add facts.

If the passages discuss CSRF, for example, you may explain the relationship
between the passages based on what they actually say about CSRF, but you
must not add technical claims that neither passage supports.

The similarity score is supporting evidence only.
It is NOT proof that the relationship is meaningful.
"""


async def analyze_book_relationship(
    query_book: str,
    query_page: int,
    query_passage: str,
    matched_book: str,
    matched_page: int,
    matched_passage: str,
    similarity: float,
) -> dict[str, Any]:

    user_prompt = f"""
Analyze the relationship between these two passages.

========================
BOOK A
========================

Title:
{query_book}

Page:
{query_page}

Semantic similarity:
{similarity:.4f}

Passage:
{query_passage}


========================
BOOK B
========================

Title:
{matched_book}

Page:
{matched_page}

Semantic similarity:
{similarity:.4f}

Passage:
{matched_passage}


========================
TASK
========================

Determine whether these passages have a meaningful conceptual
relationship.

If they are meaningfully related, provide a substantial analysis.

The analysis must explain:

1. Why they are related.
2. How their ideas connect.
3. What Book A contributes.
4. What Book B contributes.
5. An important difference between them.
6. Why comparing them is useful.
7. The specific concepts they share.

Do not leave any of those fields empty.

If the relationship is not meaningful:

- meaningful = false
- explanation should explain why
- connection should explain why there is no meaningful conceptual bridge
- bookAContribution should be ""
- bookBContribution should be ""
- importantDifference should explain the lack of meaningful connection
- whyItMatters should be ""
- sharedConcepts should be []

Return ONLY valid JSON.
"""

    response = await client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=0,
        max_tokens=1200,
        response_format={
            "type": "json_object",
        },
        messages=[
            {
                "role": "system",
                "content": RELATIONSHIP_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError(
            "Groq returned an empty response."
        )

    try:
        result = json.loads(content)

    except json.JSONDecodeError as error:
        raise RuntimeError(
            "Groq returned invalid JSON."
        ) from error


    # ========================================================
    # VALIDATE RESPONSE
    # ========================================================

    meaningful = result.get(
        "meaningful",
        False,
    )

    explanation = result.get(
        "explanation",
        "",
    )

    connection = result.get(
        "connection",
        "",
    )

    book_a_contribution = result.get(
        "bookAContribution",
        "",
    )

    book_b_contribution = result.get(
        "bookBContribution",
        "",
    )

    important_difference = result.get(
        "importantDifference",
        "",
    )

    why_it_matters = result.get(
        "whyItMatters",
        "",
    )

    shared_concepts = result.get(
        "sharedConcepts",
        [],
    )


    # ========================================================
    # NORMALIZE TYPES
    # ========================================================

    if not isinstance(
        meaningful,
        bool,
    ):
        meaningful = bool(
            meaningful
        )


    if not isinstance(
        explanation,
        str,
    ):
        explanation = str(
            explanation
        )


    if not isinstance(
        connection,
        str,
    ):
        connection = str(
            connection
        )


    if not isinstance(
        book_a_contribution,
        str,
    ):
        book_a_contribution = str(
            book_a_contribution
        )


    if not isinstance(
        book_b_contribution,
        str,
    ):
        book_b_contribution = str(
            book_b_contribution
        )


    if not isinstance(
        important_difference,
        str,
    ):
        important_difference = str(
            important_difference
        )


    if not isinstance(
        why_it_matters,
        str,
    ):
        why_it_matters = str(
            why_it_matters
        )


    if not isinstance(
        shared_concepts,
        list,
    ):
        shared_concepts = []


    shared_concepts = [
        str(concept)
        for concept in shared_concepts
        if concept
    ]


    # ========================================================
    # RETURN COMPLETE ANALYSIS
    # ========================================================

    return {
        "meaningful": meaningful,

        "explanation": explanation,

        "connection": connection,

        "bookAContribution":
            book_a_contribution,

        "bookBContribution":
            book_b_contribution,

        "importantDifference":
            important_difference,

        "whyItMatters":
            why_it_matters,

        "sharedConcepts":
            shared_concepts,
    }



