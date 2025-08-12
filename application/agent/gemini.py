import google.generativeai as genai
from services.utils import relative_date_tool
from agent.natural_language_processor import NaturalLanguageProcessor
import json
import os
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import Tool, initialize_agent, AgentType
from langchain_google_community import GoogleSearchAPIWrapper
from pydantic.v1 import BaseModel, Field

# loggingの設定
logging.basicConfig(level=logging.INFO)


# 1. 支援者情報抽出エージェントが生成するJSONの型を定義
class SupporterInfo(BaseModel):
    name: str = Field(description="氏名")
    age: int = Field(description="年齢")
    concerns: str = Field(description="困りごと")
    judgment_ability: str = Field(description="判断能力")
    service_usage_status: str = Field(description="福祉サービスの利用状況")


class GeminiAgent:
    def __init__(self, api_key: str, model_name: str = 'gemini-1.5-flash', google_cse_id: str = None, relative_date_tool_arg=None):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        if relative_date_tool_arg is not None:
            self.relative_date_tool = relative_date_tool_arg
        else:
            self.relative_date_tool = relative_date_tool
        self.nlp_processor = NaturalLanguageProcessor()

        # --- エージェントの定義 ---
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash", google_api_key=api_key)

        # 1. 支援者情報抽出エージェント (ツール不要、JSON出力に特化)
        self.information_extraction_agent = self.llm.with_structured_output(
            SupporterInfo)

        # 2. 支援計画立案エージェント (検索ツールを利用)
        search = GoogleSearchAPIWrapper(
            google_api_key=api_key, google_cse_id=google_cse_id)
        tools = [
            Tool(
                name="Google Search",
                func=search.run,
                description="useful for when you need to answer questions about current events or find up-to-date information on services, resources, or specific topics related to social work and client support."
            )
        ]
        self.support_plan_creation_agent = initialize_agent(
            tools, self.llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, verbose=True)

    def _extract_supporter_information(self, assessment_text: str) -> dict:
        """
        支援者情報抽出エージェントを実行する
        """
        prompt = f"""
        以下の支援者アセスメント情報から、氏名、年齢、困りごと、判断能力、福祉サービスの利用状況を抽出し、指定されたJSON形式で出力してください。

        --- 支援者アセスメント情報 ---
        {assessment_text}
        -----------------------------
        """
        try:
            logging.info("--- Running Information Extraction Agent ---")
            structured_data = self.information_extraction_agent.invoke(prompt)
            logging.info(
                f"--- Extracted Information: {structured_data.dict()} ---")
            return structured_data.dict()
        except Exception as e:
            logging.error(f"Information Extraction Agent execution error: {e}")
            raise

    def _create_support_plan(self, supporter_info: dict, guidelines: str) -> str:
        """
        支援計画立案エージェントを実行する
        """
        supporter_info_text = json.dumps(
            supporter_info, indent=2, ensure_ascii=False)

        prompt = f"""
        あなたは社会福祉士です。以下の支援者情報（JSON形式）とガイドラインに基づき、タスクを実行してください。

        **最重要指示:**
        - **抽象的な表現は絶対に避けてください。** 「地域の社会資源」や「関係機関」のような曖昧な言葉ではなく、**固有名詞（サービス名、施設名、店舗名など）**を必ず記載してください。
        - 提案するサービスについては、**Google Searchツールを徹底的に活用し、クライアントの状況（年齢、地域、課題など）に実際のサービスが適合するかを必ず確認してください。**
        - 検索しても情報が不足し、具体的な提案ができない場合は、**「【要確認タスク】」** という文字列を「備考」に含め、確認すべき事項を明確なタスクとして記述してください。
        - **最終的な回答は、以下のJSON形式の文字列のみを出力してください。前後に説明文などをつけないでください。**

        **タスク:**
        1.  **対象可否の判断**: 支援者情報に記載の人物が「福祉サービス利用援助事業」の対象となり得るかを判断してください。判断の根拠も簡潔に述べてください。
        2.  **支援計画の作成**: もし対象となると判断した場合、その人の具体的な困りごとに対応する形で、福祉サービス利用援助事業のサービス内容に沿った具体的な支援計画を提案してください。

        **出力JSON形式:**
        ```json
        {{
          "対象可否": "（対象となる、対象とならない、要相談のいずれか）",
          "判断理由": "（対象可否の根拠を簡潔に記述）",
          "支援計画": {{
            "目標": "（例：生活基盤の安定と自立に向けた支援）",
            "具体的な支援内容": [
              {{
                "支援項目": "（例：金銭管理の援助）",
                "サービス内容": "（例：年金・手当の受領、家賃・公共料金・税金等の支払い手続き）",
                "実施期間": "（例：契約締結後から随時）",
                "担当": "（例：生活支援員）"
              }},
              {{
                "支援項目": "（例：福祉サービスの利用援助）",
                "サービス内容": "（例：生活保護申請に向けた手続きのサポート、就労支援サービスの情報提供）",
                "実施期間": "（例：契約締結後1ヶ月以内）",
                "担当": "（例：専門員）"
              }}
            ],
            "備考": "（生活保護受給者の利用料免除など、その他補足事項や【要確認タスク】）"
          }}
        }}
        ```
        --- 支援者情報 ---
        {supporter_info_text}
        --------------------

        --- 福祉サービス利用援助事業のガイドライン ---
        {guidelines}
        -------------------------------------------
        """
        try:
            logging.info("--- Running Support Plan Creation Agent ---")
            response = self.support_plan_creation_agent(
                {"input": prompt}, return_intermediate_steps=True)

            logging.info("--- Agent Intermediate Steps ---")
            if "intermediate_steps" in response:
                for action, observation in response["intermediate_steps"]:
                    logging.info(f"Action: {action.tool}")
                    logging.info(f"Input: {action.tool_input}")
                    logging.info(f"Observation: {observation}")
                    logging.info("---------------------------------")
            logging.info("--- End of Intermediate Steps ---")

            return response['output']
        except Exception as e:
            logging.error(f"Support Plan Creation Agent execution error: {e}")
            raise

    def generate_support_plan_with_agent(self, assessment_data: dict) -> str:
        """
        2つのエージェントを連携させ、支援計画を生成する。
        """
        # TODO: 将来的には、このガイドラインは外部ファイルやデータベースから読み込むようにする
        guidelines = """
        **福祉サービス利用援助事業 ガイドライン（サンプル）**
        - **対象者**: 本事業の対象者は、判断能力が不十分な者（認知症高齢者、知的障害者、精神障害者等）であって、福祉サービスの利用に関する適切な判断が困難な者とする。
        - **支援内容**: 福祉サービスの利用援助、それに伴う金銭管理、書類等の預かりサービス。
        - **対象外**: 判断能力に問題がないと判断される者、資産管理や身上監護のみを目的とする者。
        """

        try:
            assessment_text = json.dumps(
                assessment_data, indent=2, ensure_ascii=False)

            # 1. 支援者情報抽出エージェントを実行
            supporter_info = self._extract_supporter_information(
                assessment_text)

            # 2. 支援計画立案エージェントを実行
            support_plan = self._create_support_plan(
                supporter_info, guidelines)

            return support_plan
        except Exception as e:
            logging.error(f"Support plan generation failed: {e}")
            return f"支援計画の生成中にエラーが発生しました: {e}"

    def analyze(self, text_content: str, assessment_item_name: str, user_assessment_items: dict) -> str:
        assessment_structure_info = ""
        for category, sub_items in user_assessment_items.items():
            assessment_structure_info += f"- {category}: {', '.join(sub_items)}\n"

        prompt = f"""
        あなたは社会福祉士のアセスメントシート作成を支援するAIアシスタントです。
        以下のアセスメントシートの項目「{assessment_item_name}」について、提供された日々のメモの内容から関連する情報を抽出出し、箇条書きで簡潔に要約してください。
        客観的な事実に基づいて記述し、推測や評価は含めないでください。
        関連情報がない場合は、「（関連情報なし）」と回答してください。

        ---アセスメントシートの項目構造---
        {assessment_structure_info}
        ---日々のメモ内容---
        {text_content}
        -------------------

        「{assessment_item_name}」項目に関連する要約情報:
        """
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                return response.candidates[0].content.parts[0].text.strip()
            else:
                return "（応答がありませんでした。）"
        except Exception as e:
            return f"Gemini API呼び出しエラー: {e}"

    def map_to_assessment_items(self, text_content: str, assessment_items: dict) -> dict:
        """
        NLPで抽出した情報とGeminiの解釈をアセスメント項目にマッピングする。
        """
        # 1. NLPによる情報抽出
        nlp_results = self.nlp_processor.analyze_text(text_content)
        entities = nlp_results["entities"]
        sentiment = nlp_results["sentiment"]

        # 2. Geminiによる文脈解釈とマッピング
        prompt = f"""
        あなたは社会福祉士のアセスメント業務を支援するAIアシスタントです。
        以下の「面談記録」と「抽出されたエンティティ情報」を分析し、
        指定された「アセスメントシートの項目」に沿って、関連する情報を整理・要約してください。

        出力は、各アセスメント項目に対応する情報を記述したJSON形式でなければなりません。
        客観的な事実に基づいて記述し、情報がない項目は「該当なし」としてください。

        --- 面談記録 ---
        {text_content}
        ----------------

        --- 抽出されたエンティティ情報 ---
        {', '.join([entity.name for entity in entities])}
        ----------------

        --- アセスメントシートの項目 ---
        {json.dumps(assessment_items, indent=2, ensure_ascii=False)}
        ----------------

        以下のJSON形式で、アセスメント項目に対応する情報を記述してください:
        """
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                # Geminiからの応答（JSON文字列を想定）をパースする
                response_text = response.candidates[0].content.parts[0].text.strip()
                # マークダウンの```json ... ```を削除
                if response_text.startswith("```json"):
                    response_text = response_text[7:-3].strip()
                return json.loads(response_text)
            else:
                return {"error": "Geminiからの応答がありませんでした。"}
        except Exception as e:
            return {"error": f"Gemini API呼び出しエラー: {e}"}