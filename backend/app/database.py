import os
from pathlib import Path

from sqlalchemy import JSON, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Run(Base):
    __tablename__ = 'runs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[str] = mapped_column(String)
    config: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    cursor: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default='paused')


db_path = Path(__file__).resolve().parents[1] / 'gridsentinel.db'
engine = create_engine(os.environ.get('GRIDSENTINEL_DATABASE_URL', f'sqlite:///{db_path.as_posix()}'), connect_args={'check_same_thread': False})
Session = sessionmaker(engine)
Base.metadata.create_all(engine)
