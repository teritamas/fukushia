from venv import logger
import google.generativeai as genai
from agent.natural_language_processor import NaturalLanguageProcessor
import json
import logging
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_react_agent, AgentExecutor, Tool
from langchain.tools.render import render_text_description
from langchain_google_community import GoogleSearchAPIWrapper
from langchain.prompts import PromptTemplate

from .prompts.planner import PLANNER_PROMPT
from .prompts.conversational_agent import CONVERSATIONAL_AGENT_PROMPT
from .tools.support_planner_tools import (
    search_resource_detail,
    suggest_resources,
)

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

        # --- Robust Google Search Tool (safe wrapper) ---
        search_api = GoogleSearchAPIWrapper(google_api_key=api_key, google_cse_id=google_cse_id)

        def safe_google_search(query: str) -> str:
            """トップ検索結果を安全に取得し構造化テキストで返す。失敗時もNoneを返さず必ず説明文を返す。"""
            logging.info(f"【Tool】Executing safe_google_search with query: {query}")
            try:
                # 2025/令和7年度など最新年度情報を意図したクエリ強化: 年度指定が無く制度/給付系キーワードなら 2025 を付加
                if not any(y in query for y in ["2025", "令和7", "R7"]) and any(
                    k in query for k in ["制度", "給付", "補助", "支援", "助成", "要件", "対象"]
                ):
                    query += " 2025"
                    logging.info(f"【Tool】Augmented google query with year -> {query}")
                results = search_api.results(query, num_results=5)
                if not results:
                    return "Google検索結果は0件でした。クエリを具体化してください。"
                formatted = []
                for r in results:
                    formatted.append(
                        "タイトル: {title}\nリンク: {link}\nスニペット: {snippet}".format(
                            title=r.get("title", "N/A"),
                            link=r.get("link", "N/A"),
                            snippet=r.get("snippet", "N/A"),
                        )
                    )
                return "\n---\n".join(formatted)
            except Exception as e:
                logging.error(f"Google検索中に例外: {e}", exc_info=True)
                return f"Google検索でエラーが発生しました（再試行/別クエリを検討）: {e}"

        google_search_tool = Tool(
            name="google_search",
            func=safe_google_search,
            description="Google検索を実行し最新の制度・サービス情報を取得する。ローカル検索で不足した場合に使用する。出力はタイトル/リンク/スニペットの一覧。",
        )

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
