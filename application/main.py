import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent.gemini import GeminiAgent
from routes import register_routes


load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.getLogger(__name__).info("アプリケーションを起動します...")
    if not GEMINI_API_KEY or not GOOGLE_CSE_ID:
        raise ValueError("APIキーまたはCSE IDが設定されていません。")

    app.state.gemini_agent = GeminiAgent(api_key=GEMINI_API_KEY, google_cse_id=GOOGLE_CSE_ID)
    logging.getLogger(__name__).info("GeminiAgentの初期化が完了しました。")
    yield
    logging.getLogger(__name__).info("アプリケーションをシャットダウンします...")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


register_routes(app)

