"""Create the account and social foundation tables.

Adapted for the existing Reading Memory / SocialBooks database.

Existing profiles, books, and comments tables are preserved.
Existing reading-related tables are not dropped or recreated.
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0001_social_foundation"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require_empty_table(table_name: str) -> None:
    """Stop if a table being structurally adapted already contains data."""
    if context.is_offline_mode():
        return

    allowed_tables = {"profiles", "books", "comments"}
    if table_name not in allowed_tables:
        raise ValueError(f"Unexpected table name: {table_name}")

    bind = op.get_bind()
    count = bind.execute(
        sa.text(f'SELECT COUNT(*) FROM public."{table_name}"')
    ).scalar_one()

    if count != 0:
        raise RuntimeError(
            f"Migration stopped: public.{table_name} contains "
            f"{count} rows. Review the migration before proceeding."
        )


def upgrade() -> None:
    # These tables already exist. Their current rows must not be
    # assumed compatible with the new authentication relationships.
    _require_empty_table("profiles")
    _require_empty_table("books")
    _require_empty_table("comments")

    # ---------------------------------------------------------
    # 1. Create the custom-authentication users table.
    # ---------------------------------------------------------

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "email = lower(email)",
            name="ck_users_email_lowercase",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_index(
        "ix_users_email",
        "users",
        ["email"],
        unique=True,
    )

    # ---------------------------------------------------------
    # 2. Adapt the EXISTING profiles table.
    #
    # Preserve profiles.id and the existing profile fields.
    # Replace its Supabase auth.users foreign key with the
    # custom application's users relationship.
    # ---------------------------------------------------------

    op.drop_constraint(
        "profiles_id_fkey",
        "profiles",
        type_="foreignkey",
    )

    op.add_column(
        "profiles",
        sa.Column("user_id", sa.Uuid(), nullable=True),
    )

    op.create_foreign_key(
        "profiles_user_id_fkey",
        "profiles",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_unique_constraint(
        "uq_profiles_user_id",
        "profiles",
        ["user_id"],
    )

    # The table was verified to be empty, so these columns can
    # safely become NOT NULL without inventing user data.
    op.alter_column(
        "profiles",
        "user_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )

    op.alter_column(
        "profiles",
        "username",
        existing_type=sa.Text(),
        nullable=False,
    )

    op.alter_column(
        "profiles",
        "display_name",
        existing_type=sa.Text(),
        nullable=False,
    )

    op.execute(
        sa.text(
            "UPDATE public.profiles SET bio = '' WHERE bio IS NULL"
        )
    )

    op.alter_column(
        "profiles",
        "bio",
        existing_type=sa.Text(),
        server_default="",
        nullable=False,
    )

    # The existing database already has a unique constraint on
    # username. This index also matches the SQLAlchemy model.
   
    # ---------------------------------------------------------
    # 3. Adapt the EXISTING books table.
    #
    # Keep created_by, description, cover_url, updated_at,
    # and the existing foreign key to profiles.
    # ---------------------------------------------------------

    op.add_column(
        "books",
        sa.Column("owner_id", sa.Uuid(), nullable=True),
    )

    op.add_column(
        "books",
        sa.Column(
            "source_document_id",
            sa.String(length=100),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "books_owner_id_fkey",
        "books",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column(
        "books",
        "owner_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )

    op.create_index(
        "ix_books_owner_id",
        "books",
        ["owner_id"],
    )

    # ---------------------------------------------------------
    # 4. Create posts.
    # ---------------------------------------------------------

    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("book_id", sa.Uuid(), nullable=False),
        sa.Column("post_type", sa.String(length=16), nullable=False),
        sa.Column(
            "content",
            sa.Text(),
            server_default="",
            nullable=False,
        ),
        sa.Column("ai_question", sa.Text(), nullable=True),
        sa.Column("ai_answer", sa.Text(), nullable=True),
        sa.Column(
            "visibility",
            sa.String(length=16),
            server_default="PRIVATE",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "post_type IN ('REVIEW', 'THOUGHT', 'QUESTION')",
            name="ck_posts_post_type",
        ),
        sa.CheckConstraint(
            "visibility IN ('PRIVATE', 'FOLLOWERS', 'PUBLIC')",
            name="ck_posts_visibility",
        ),
        sa.CheckConstraint(
            "post_type != 'QUESTION' OR ai_question IS NOT NULL",
            name="ck_posts_question_text",
        ),
        sa.ForeignKeyConstraint(
            ["book_id"],
            ["books.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    for column in (
        "user_id",
        "book_id",
        "post_type",
        "visibility",
        "created_at",
    ):
        op.create_index(
            f"ix_posts_{column}",
            "posts",
            [column],
        )

    # ---------------------------------------------------------
    # 5. Adapt the EXISTING comments table.
    #
    # Keep book_id, note_id, content, timestamps, and their
    # existing foreign keys.
    # ---------------------------------------------------------

    op.drop_constraint(
        "comments_user_id_fkey",
        "comments",
        type_="foreignkey",
    )

    op.add_column(
        "comments",
        sa.Column("post_id", sa.Uuid(), nullable=True),
    )

    op.create_foreign_key(
        "comments_post_id_fkey",
        "comments",
        "posts",
        ["post_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_foreign_key(
        "comments_user_id_fkey",
        "comments",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Existing comments were verified to be absent.
    op.alter_column(
        "comments",
        "post_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )

    op.create_index(
        "ix_comments_post_id",
        "comments",
        ["post_id"],
    )

    # Allow a comment to target exactly one book, note, or post.
    # This replaces the previous target check with one that
    # includes the new post_id column.
    op.drop_constraint(
        "comment_target_check",
        "comments",
        type_="check",
    )

    op.create_check_constraint(
        "comment_target_check",
        "comments",
        "num_nonnulls(book_id, note_id, post_id) = 1",
    )

    # ---------------------------------------------------------
    # 6. Create likes.
    # ---------------------------------------------------------

    op.create_table(
        "likes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["posts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "post_id",
            name="uq_likes_user_post",
        ),
    )

    op.create_index("ix_likes_post_id", "likes", ["post_id"])
    op.create_index("ix_likes_user_id", "likes", ["user_id"])

    # ---------------------------------------------------------
    # 7. Create follows.
    # ---------------------------------------------------------

    op.create_table(
        "follows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("follower_id", sa.Uuid(), nullable=False),
        sa.Column("following_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "follower_id != following_id",
            name="ck_follows_not_self",
        ),
        sa.ForeignKeyConstraint(
            ["follower_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["following_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "follower_id",
            "following_id",
            name="uq_follows_pair",
        ),
    )

    op.create_index(
        "ix_follows_follower_id",
        "follows",
        ["follower_id"],
    )
    op.create_index(
        "ix_follows_following_id",
        "follows",
        ["following_id"],
    )

    # ---------------------------------------------------------
    # 8. Create notifications.
    # ---------------------------------------------------------

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=True),
        sa.Column("comment_id", sa.Uuid(), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "type IN ('LIKE', 'COMMENT', 'FOLLOW')",
            name="ck_notifications_type",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["comment_id"],
            ["comments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["post_id"],
            ["posts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_notifications_user_id",
        "notifications",
        ["user_id"],
    )
    op.create_index(
        "ix_notifications_is_read",
        "notifications",
        ["is_read"],
    )

    # ---------------------------------------------------------
    # 9. Create reports.
    # ---------------------------------------------------------

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("target_type", sa.String(length=16), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=24), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="OPEN",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "target_type IN ('POST', 'COMMENT', 'USER')",
            name="ck_reports_target_type",
        ),
        sa.CheckConstraint(
            "reason IN ('SPAM', 'HARASSMENT', 'HATE', "
            "'SEXUAL_CONTENT', 'MISINFORMATION', 'COPYRIGHT', 'OTHER')",
            name="ck_reports_reason",
        ),
        sa.CheckConstraint(
            "status IN ('OPEN', 'RESOLVED', 'DISMISSED')",
            name="ck_reports_status",
        ),
        sa.ForeignKeyConstraint(
            ["reporter_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_reports_status",
        "reports",
        ["status"],
    )

    # ---------------------------------------------------------
    # 10. Create blocks.
    # ---------------------------------------------------------

    op.create_table(
        "blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("blocker_id", sa.Uuid(), nullable=False),
        sa.Column("blocked_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "blocker_id != blocked_id",
            name="ck_blocks_not_self",
        ),
        sa.ForeignKeyConstraint(
            ["blocked_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["blocker_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "blocker_id",
            "blocked_id",
            name="uq_blocks_pair",
        ),
    )


def downgrade() -> None:
    raise NotImplementedError(
        "This migration adapts pre-existing Reading Memory tables. "
        "Do not automatically downgrade it: restoring the original "
        "schema requires a separately reviewed reverse migration."
    )