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
    _add_missing_columns()


# create_all never alters an existing table: add the columns introduced after a table was first created.
NEW_COLUMNS = {'chat_images': {'sha256': 'VARCHAR(64)', 'encryption': 'VARCHAR(16)'},
               'referrals': {'options': 'JSON'}}


def _add_missing_columns():
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in NEW_COLUMNS.items():
            if not insp.has_table(table):
                continue
            have = {c['name'] for c in insp.get_columns(table)}
            for name, sql_type in cols.items():
                if name not in have:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {sql_type}'))
