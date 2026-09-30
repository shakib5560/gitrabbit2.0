import os
import urllib.parse
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

def get_normalized_database_url(url: str | None = None) -> str:
    raw_url = url or os.getenv("DATABASE_URL") or "postgresql+asyncpg://postgres:postgres@localhost:5434/ai_db"
    
    # Ensure asyncpg driver prefix
    if raw_url.startswith("postgres://"):
        raw_url = "postgresql+asyncpg://" + raw_url[len("postgres://"):]
    elif raw_url.startswith("postgresql://"):
        raw_url = "postgresql+asyncpg://" + raw_url[len("postgresql://"):]
    
    # Strip libpq-specific query params not supported by asyncpg and map sslmode to ssl
    parsed = urllib.parse.urlsplit(raw_url)
    if parsed.query:
        query_dict = urllib.parse.parse_qs(parsed.query)
        ssl_needed = False
        if "sslmode" in query_dict:
            val = query_dict.pop("sslmode")[0]
            if val in ("require", "verify-ca", "verify-full", "prefer"):
                ssl_needed = True
        if "channel_binding" in query_dict:
            query_dict.pop("channel_binding")
        
        if ssl_needed and "ssl" not in query_dict:
            query_dict["ssl"] = ["require"]
            
        new_query = urllib.parse.urlencode([(k, v) for k, vals in query_dict.items() for v in vals])
        parsed = parsed._replace(query=new_query)
        raw_url = urllib.parse.urlunsplit(parsed)
        
    return raw_url

DATABASE_URL = get_normalized_database_url()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

Base = declarative_base()

async def get_db():
    async with async_session_maker() as session:
        yield session

