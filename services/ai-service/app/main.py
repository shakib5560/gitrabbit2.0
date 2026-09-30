import asyncio
from fastapi import FastAPI
from sqlalchemy import text
from app.api import router as api_router
from app.db.database import async_session_maker

app = FastAPI(title="AI Service API", version="1.0.0")

@app.get("/")
async def root():
    return {"status": "ok", "service": "ai-service"}

@app.get("/health")
async def health_check():
    db_status = "ok"
    try:
        async with async_session_maker() as session:
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=3.0)
    except Exception as e:
        db_status = f"degraded: {str(e)}"
    return {"status": "ok", "service": "ai-service", "database": db_status}

app.include_router(api_router, prefix="/api")
