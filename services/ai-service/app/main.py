from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api import router as api_router
from app.db.database import get_db

app = FastAPI(title="AI Service API", version="1.0.0")

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"
    return {"status": "ok", "service": "ai-service", "database": db_status}

app.include_router(api_router, prefix="/api")
