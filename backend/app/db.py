from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app import config

_connect = {'check_same_thread': False} if config.DATABASE_URL.startswith('sqlite') else {}
engine = create_engine(config.DATABASE_URL, connect_args=_connect, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app import models  # noqa: F401  (registers the tables)
    Base.metadata.create_all(engine)
