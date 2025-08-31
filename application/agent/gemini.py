import google.generativeai as genai
import json
import logging
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools.render import render_text_description
from langchain.prompts import PromptTemplate

from .prompts.planner import PLANNER_PROMPT
from .prompts.conversational_agent import CONVERSATIONAL_AGENT_PROMPT
from .tools.support_planner_tools import create_suggest_resources_tool
from .tools.google_search_tool import create_google_search_tool

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class GeminiAgent:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-1.5-flash",
        google_cse_id: str = None,
    ):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        self.google_cse_id = google_cse_id

        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=api_key,
        )

        # --- Tools ---
        google_search_tool = create_google_search_tool(api_key, google_cse_id)
        rag_suggest_tool = create_suggest_resources_tool()

        tools = [google_search_tool, rag_suggest_tool]

        # プランナー用プロンプト
        planner_prompt = PromptTemplate.from_template(PLANNER_PROMPT).partial(
            tools=render_text_description(tools),
            tool_names=", ".join([t.name for t in tools]),
        )
        planner_agent_core = create_react_agent(self.llm, tools, planner_prompt)
        self.planner_agent = AgentExecutor(
            agent=planner_agent_core,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,  # 無限ループを防ぐ
        )

        # 会話用プロンプト
        conversational_prompt = PromptTemplate.from_template(CONVERSATIONAL_AGENT_PROMPT).partial(
            tools=render_text_description(tools),
            tool_names=", ".join([t.name for t in tools]),
        )
        conversational_agent_core = create_react_agent(self.llm, tools, conversational_prompt)
        self.conversational_agent = AgentExecutor(
            agent=conversational_agent_core,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=10,  # 無限ループを防ぐ
        )

    async def generate_interactive_support_plan_stream(
        self,
        client_name: str,
        assessment_data: dict,
        message: str,
    ):
        """
        会話型エージェントで、ユーザーの質問・会話に自然な文章で答える。

        この関数は非同期ジェネレータを返すため、FastAPI等でStreamingResponseとして利用できます。
        """
        context = json.dumps(assessment_data, ensure_ascii=False, indent=2)[:8000]
        conv_input = f"利用者: {client_name}\n状況: {context}\n質問: {message}"
        try:

            async def stream_generator():
                try:
                    async for event in self.conversational_agent.astream_events({"input": conv_input}):
                        if event["event"] == "on_chat_model_stream":
                            data = (
                                f"data: {json.dumps({'chunk': event['data']['chunk'].content}, ensure_ascii=False)}\n\n"
                            )
                            logging.debug(f"type: {event['event']} data: {data}")
                            yield data
                        await asyncio.sleep(0.01)
                    yield "event: done\ndata: [DONE]\n\n"
                except Exception as e:
                    logging.error(f"stream_generator error: {e}", exc_info=True)
                    yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

            return stream_generator()
        except Exception as e:
            logging.error(f"会話応答生成失敗: {e}", exc_info=True)

            async def err_gen():
                yield f"event: error\ndata: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

            return err_gen()
