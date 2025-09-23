import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.assessment_mapping_agent import AssessmentMappingAgent
from agents.interactive_support_plan_agent import InteractiveSupportPlanAgent
from agents.conversational_agent import ConversationalAgent
from agents.router_agent import RouterAgent
from agents.suggestion_agent import SuggestionAgent
from agents.task_execution_agent import TaskExecutionAgent
from routes import register_routes
import config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate required envs are present via config import
    if not config.GEMINI_API_KEY or not config.GOOGLE_CSE_ID:
        raise ValueError("APIキーまたはCSE IDが設定されていません。")

    app.state.assessment_agent = AssessmentMappingAgent(api_key=config.GEMINI_API_KEY)
    app.state.support_plan_agent = InteractiveSupportPlanAgent(
        api_key=config.GEMINI_API_KEY, google_cse_id=config.GOOGLE_CSE_ID
    )
    app.state.conversational_agent = ConversationalAgent(api_key=config.GEMINI_API_KEY)
    app.state.router_agent = RouterAgent(api_key=config.GEMINI_API_KEY)
    app.state.suggestion_agent = SuggestionAgent(api_key=config.GEMINI_API_KEY)
    app.state.task_execution_agent = TaskExecutionAgent(
        api_key=config.GEMINI_API_KEY, google_cse_id=config.GOOGLE_CSE_ID
    )
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
