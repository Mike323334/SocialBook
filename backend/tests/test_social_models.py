import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import Block, Book, Follow, Like, Post, Profile, User


def test_social_schema_has_expected_tables_and_private_post_default() -> None:
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    table_names = set(inspect(engine).get_table_names())

    assert {
        'users', 'profiles', 'books', 'posts', 'comments', 'likes',
        'follows', 'notifications', 'reports', 'blocks',
    } <= table_names

    with Session(engine) as session:
        user = User(email='reader@example.test', password_hash='test-hash')
        session.add(user)
        session.flush()
        profile = Profile(user_id=user.id, username='reader', display_name='Reader')
        book = Book(owner_id=user.id, title='A Book')
        session.add_all([profile, book])
        session.flush()
        post = Post(user_id=user.id, book_id=book.id, post_type='REVIEW', content='A thoughtful book.')
        session.add(post)
        session.commit()

    assert post.visibility == 'PRIVATE'


def test_likes_follows_and_blocks_enforce_unique_and_self_constraints() -> None:
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        reader = User(email='reader@example.test', password_hash='test-hash')
        other = User(email='other@example.test', password_hash='test-hash')
        session.add_all([reader, other])
        session.flush()
        book = Book(owner_id=reader.id, title='A Book')
        session.add(book)
        session.flush()
        post = Post(user_id=reader.id, book_id=book.id, post_type='THOUGHT', content='An idea.')
        session.add(post)
        session.flush()
        session.add(Like(user_id=other.id, post_id=post.id))
        session.commit()

        session.add(Like(user_id=other.id, post_id=post.id))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(Follow(follower_id=reader.id, following_id=reader.id))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(Block(blocker_id=reader.id, blocked_id=reader.id))
        with pytest.raises(IntegrityError):
            session.commit()