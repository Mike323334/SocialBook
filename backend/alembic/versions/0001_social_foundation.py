"""Create the account and social foundation tables."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001_social_foundation'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('email = lower(email)', name='ck_users_email_lowercase'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_table(
        'profiles',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('username', sa.String(length=32), nullable=False),
        sa.Column('display_name', sa.String(length=80), nullable=False),
        sa.Column('bio', sa.String(length=500), server_default='', nullable=False),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )
    op.create_index('ix_profiles_username', 'profiles', ['username'], unique=True)
    op.create_table(
        'books',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_id', sa.Uuid(), nullable=False),
        sa.Column('source_document_id', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('author', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_books_owner_id', 'books', ['owner_id'])
    op.create_table(
        'posts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('book_id', sa.Uuid(), nullable=False),
        sa.Column('post_type', sa.String(length=16), nullable=False),
        sa.Column('content', sa.Text(), server_default='', nullable=False),
        sa.Column('ai_question', sa.Text(), nullable=True),
        sa.Column('ai_answer', sa.Text(), nullable=True),
        sa.Column('visibility', sa.String(length=16), server_default='PRIVATE', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("post_type IN ('REVIEW', 'THOUGHT', 'QUESTION')", name='ck_posts_post_type'),
        sa.CheckConstraint("visibility IN ('PRIVATE', 'FOLLOWERS', 'PUBLIC')", name='ck_posts_visibility'),
        sa.CheckConstraint("post_type != 'QUESTION' OR ai_question IS NOT NULL", name='ck_posts_question_text'),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    for column in ('user_id', 'book_id', 'post_type', 'visibility', 'created_at'):
        op.create_index(f'ix_posts_{column}', 'posts', [column])
    op.create_table(
        'comments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('post_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_comments_post_id', 'comments', ['post_id'])
    op.create_table(
        'likes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('post_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'post_id', name='uq_likes_user_post'),
    )
    op.create_index('ix_likes_post_id', 'likes', ['post_id'])
    op.create_index('ix_likes_user_id', 'likes', ['user_id'])
    op.create_table(
        'follows',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('follower_id', sa.Uuid(), nullable=False),
        sa.Column('following_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('follower_id != following_id', name='ck_follows_not_self'),
        sa.ForeignKeyConstraint(['follower_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['following_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('follower_id', 'following_id', name='uq_follows_pair'),
    )
    op.create_index('ix_follows_follower_id', 'follows', ['follower_id'])
    op.create_index('ix_follows_following_id', 'follows', ['following_id'])
    op.create_table(
        'notifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('actor_id', sa.Uuid(), nullable=False),
        sa.Column('type', sa.String(length=16), nullable=False),
        sa.Column('post_id', sa.Uuid(), nullable=True),
        sa.Column('comment_id', sa.Uuid(), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("type IN ('LIKE', 'COMMENT', 'FOLLOW')", name='ck_notifications_type'),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['comment_id'], ['comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'])
    op.create_table(
        'reports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('reporter_id', sa.Uuid(), nullable=False),
        sa.Column('target_type', sa.String(length=16), nullable=False),
        sa.Column('target_id', sa.Uuid(), nullable=False),
        sa.Column('reason', sa.String(length=24), nullable=False),
        sa.Column('status', sa.String(length=16), server_default='OPEN', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("target_type IN ('POST', 'COMMENT', 'USER')", name='ck_reports_target_type'),
        sa.CheckConstraint("reason IN ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'MISINFORMATION', 'COPYRIGHT', 'OTHER')", name='ck_reports_reason'),
        sa.CheckConstraint("status IN ('OPEN', 'RESOLVED', 'DISMISSED')", name='ck_reports_status'),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reports_status', 'reports', ['status'])
    op.create_table(
        'blocks',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('blocker_id', sa.Uuid(), nullable=False),
        sa.Column('blocked_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('blocker_id != blocked_id', name='ck_blocks_not_self'),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_id', 'blocked_id', name='uq_blocks_pair'),
    )


def downgrade() -> None:
    op.drop_table('blocks')
    op.drop_index('ix_reports_status', table_name='reports')
    op.drop_table('reports')
    op.drop_index('ix_notifications_is_read', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_follows_following_id', table_name='follows')
    op.drop_index('ix_follows_follower_id', table_name='follows')
    op.drop_table('follows')
    op.drop_index('ix_likes_user_id', table_name='likes')
    op.drop_index('ix_likes_post_id', table_name='likes')
    op.drop_table('likes')
    op.drop_index('ix_comments_post_id', table_name='comments')
    op.drop_table('comments')
    for column in ('created_at', 'visibility', 'post_type', 'book_id', 'user_id'):
        op.drop_index(f'ix_posts_{column}', table_name='posts')
    op.drop_table('posts')
    op.drop_index('ix_books_owner_id', table_name='books')
    op.drop_table('books')
    op.drop_index('ix_profiles_username', table_name='profiles')
    op.drop_table('profiles')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')