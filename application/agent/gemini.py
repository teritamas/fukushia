from venv import logger
import google.generativeai as genai
from agent.natural_language_processor import NaturalLanguageProcessor
import json
import logging
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor, Tool
from langchain.tools.render import render_text_description
from langchain.prompts import PromptTemplate

from .prompts.planner import PLANNER_PROMPT
from .prompts.conversational_agent import CONVERSATIONAL_AGENT_PROMPT
from .tools.support_planner_tools import (
    search_resource_detail,
    suggest_resources,
)
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
        self.nlp_processor = NaturalLanguageProcessor()
        self.google_cse_id = google_cse_id

        # --- エージェントの定義 ---
        # NOTE: convert_system_message_to_human parameter removed in newer langchain-google-genai versions
        # Remove to avoid: 'ChatGoogleGenerativeAI' object has no attribute 'convert_system_message_to_human'
        # ライブラリのバージョン不整合対策: _prepare_request が convert_system_message_to_human を参照するが
        # モデル定義からフィールドが削除されている場合があるため、クラスに擬似フィールドを追加して解消
        if not hasattr(ChatGoogleGenerativeAI, "convert_system_message_to_human"):
            logging.warning(
                "Monkeypatch: Adding missing attribute 'convert_system_message_to_human' to ChatGoogleGenerativeAI class (False)."
            )
            ChatGoogleGenerativeAI.convert_system_message_to_human = False  # class attribute

        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=api_key,
        )

        # --- Robust Google Search Tool (extracted) ---
        google_search_tool = create_google_search_tool(api_key, google_cse_id)

        tools = [
            # search_resource_detail, # FIXME: これがうまく動いていない
            suggest_resources,
            google_search_tool,
        ]

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

    def generate_support_plan_with_agent(self, assessment_data: dict) -> str:
        """
        プランナーエージェントを呼び出し、支援計画を生成する。
        """
        try:
            logging.info("--- Invoking Planner Agent ---")
            # supporter_info を明示的に抽出 / 供給
            supporter_info = assessment_data.get("supporter_info")

            # 簡易フォールバック抽出: assessment_data['assessment'] の構造から主要フィールドを拾う
            if supporter_info is None:
                supporter_info = {}
                a = assessment_data.get("assessment") or {}
                try:
                    form1 = a.get("様式1：インテークシート", {})
                    personal = form1.get("本人情報", {}) if isinstance(form1, dict) else {}
                    consult = form1.get("相談内容", {}) if isinstance(form1, dict) else {}
                    supporter_info.update(
                        {
                            "name": personal.get("氏名") or personal.get("名前"),
                            "address": personal.get("現住所") or personal.get("住所"),
                        }
                    )
                    # concerns を複数フィールドから連結
                    concern_parts = []
                    if isinstance(consult, dict):
                        concern_parts.append(consult.get("相談の概要"))
                    supporter_info["concerns"] = "。".join([p for p in concern_parts if p]) or None
                except Exception:
                    pass

                # プレースホルダ補完
                for k in ["name", "address", "concerns"]:
                    supporter_info.setdefault(k, "不明")

            # エージェントに与える入力テキストを構築
            agent_input_obj = {
                "supporter_info": supporter_info,
                "raw_assessment": assessment_data,
            }
            assessment_text = json.dumps(agent_input_obj, indent=2, ensure_ascii=False)

            # エージェントの入力は`input`キーに文字列として渡す
            response = self.planner_agent.invoke({"input": assessment_text})

            plan_json = response["output"]

            logging.info("--- Planner Agent Finished ---")
            # JSONオブジェクトを整形された文字列として返す
            return json.dumps(plan_json, indent=2, ensure_ascii=False)

        except Exception as e:
            logging.error(f"Planner Agent execution failed: {e}", exc_info=True)
            return f"支援計画の生成中にエラーが発生しました: {e}"

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
