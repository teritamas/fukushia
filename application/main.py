import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.gemini import GeminiAgent
from routes import register_routes
import config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate required envs are present via config import
    if not config.GEMINI_API_KEY or not config.GOOGLE_CSE_ID:
        raise ValueError("APIキーまたはCSE IDが設定されていません。")

    app.state.gemini_agent = GeminiAgent(api_key=config.GEMINI_API_KEY, google_cse_id=config.GOOGLE_CSE_ID)
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


register_routes(app)
