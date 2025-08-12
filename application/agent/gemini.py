import google.generativeai as genai
from services.utils import relative_date_tool
from agent.natural_language_processor import NaturalLanguageProcessor
import json
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import Tool, initialize_agent, AgentType
from langchain_community.utilities import GoogleSearchAPIWrapper


class GeminiAgent:
    def __init__(self, api_key: str, model_name: str = 'gemini-1.5-flash', google_cse_id: str = None, relative_date_tool_arg=None):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        # 相対日付→絶対日付変換toolを注入
        if relative_date_tool_arg is not None:
            self.relative_date_tool = relative_date_tool_arg
        else:
            self.relative_date_tool = relative_date_tool
        self.nlp_processor = NaturalLanguageProcessor()

        # LangChainエージェントの初期化
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash", google_api_key=api_key)

        # Google Custom Search Engineの設定
        if google_cse_id:
            os.environ["GOOGLE_CSE_ID"] = google_cse_id
            os.environ["GOOGLE_API_KEY"] = api_key

        # ツールの設定
        search = GoogleSearchAPIWrapper()
        self.tools = [
            Tool(
                name="Google Search",
                func=search.run,
                description="useful for when you need to answer questions about current events or find up-to-date information on services, resources, or specific topics related to social work and client support."
            )
        ]
        self.agent = initialize_agent(
            self.tools, self.llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, verbose=True)

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

    def generate_support_plan_with_agent(self, assessment_data: dict) -> str:
        """
        LangChainエージェントを使用して、アセスメント情報と外部情報に基づいて支援計画を生成する。
        """
        assessment_text = json.dumps(
            assessment_data, indent=2, ensure_ascii=False)

        prompt = f"""
        あなたは非常に優秀で経験豊富なソーシャルワーカーです。特に金銭の管理を担当しています。
        支援者の合意のもと、印鑑や通帳、キャッシュカードをや現金を預かり、お小遣いを渡したりします。
        ケアマネや他の支援者と連携し、クライアントの生活を支えるための具体的なタスクを作成します。
        支援者の年齢を考慮したツールを使用し、クライアントの生活を支えるための具体的な支援計画を作成します。
        何の福祉サービスを利用するのかを相談し、条件に当てはまっているか、空きがあるかを確認します。
        以下のクライアントのアセスメント情報に基づき、**極めて具体的で、即座に行動に移せるレベルの**支援計画のたたき台を作成してください。

        **最重要指示:**
        - **抽象的な表現は絶対に避けてください。** 「地域の社会資源」や「関係機関」のような曖昧な言葉ではなく、**固有名詞（サービス名、施設名、店舗名など）**を必ず記載してください。
        - 提案するサービスについては、**Google Searchツールを徹底的に活用し、クライアントの状況（年齢、地域、課題など）に適合するかを必ず確認してください。**
        - 検索しても情報が不足し、具体的な提案ができない場合は、**「【要確認タスク】」** として、確認すべき事項を明確なタスクとして記述してください。

        **支援計画の構成:**
        1.  **長期目標**: クライアントが最終的に目指す状態を一言で表現してください。（例：安定した生活基盤を築き、地域社会とのつながりを回復する）
        2.  **短期目標**: 長期目標を達成するための、具体的で測定可能な小さなステップを複数設定してください。（例：1ヶ月以内に食生活の安定を図る）
        3.  **具体的な支援内容**:
            - 各短期目標を達成するための、**固有名詞を含む**具体的なアクションプランを記述します。
            - **悪い例:** 「地域のフードバンクや子ども食堂を利用する」「安価な店舗を案内する」
            - **良い例:** 「Google Searchで『〇〇市 フードバンク 大人』と検索し、ヒットした『NPO法人△△』に連絡し、利用条件を確認する」「業務用スーパーの『□□店』の利用を提案する」
            - **情報が不足する場合の例:** 「【要確認タスク】クライアントの住所から利用可能な『NPO法人△△』の配布場所に通えるか、交通手段と所要時間を確認する」
        4.  **留意事項**: 支援を進める上での注意点や、クライアントの強み（ストレングス）を活かす視点を記述してください。

        --- クライアントのアセスメント情報 ---
        {assessment_text}
        ------------------------------------

        上記の情報を基に、プロフェッショナルな視点から、クライアントの自己決定を尊重し、
        ストレングスを最大限に活用するような支援計画を作成してください。
        """
        try:
            # LangChainエージェントを実行し、中間ステップも取得する
            response = self.agent.invoke({"input": prompt}, return_intermediate_steps=True)
            print("--- Agent Intermediate Steps ---")
            print(response)
            return response['output']
        except Exception as e:
            return f"LangChain Agent実行エラー: {e}"

    def generate_support_plan(self, assessment_data: dict) -> str:
        """
        アセスメント情報に基づいて支援計画のたたき台を生成する。
        """
        assessment_text = json.dumps(assessment_data, indent=2, ensure_ascii=False)

        prompt = f"""
        あなたは経験豊富なソーシャルワーカーです。
        以下のクライアントのアセスメント情報に基づいて、包括的で具体的な支援計画のたたき台を作成してください。

        支援計画には、以下の要素を含めてください。
        1.  **長期目標**: クライアントが最終的に目指す状態を一言で表現してください。
        2.  **短期目標**: 長期目標を達成するための、具体的で測定可能な小さなステップ。複数設定してください。
        3.  **具体的な支援内容**: 各短期目標を達成するために、支援者が行う具体的なアクションや提供するサービス。
        4.  **留意事項**: 支援を進める上での注意点や、クライアントの強み（ストレングス）を活かす視点。

        --- クライアントのアセスメント情報 ---
        {assessment_text}
        ------------------------------------

        上記の情報を基に、プロフェッショナルな視点から、クライアントの自己決定を尊重し、
        ストレングスを最大限に活用するような支援計画を作成してください。
        """
        try:
            response = self.model.generate_content(prompt)
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                print(f"Gemini Response: {response.candidates[0].content.parts[0].text.strip()}")
                return response.candidates[0].content.parts[0].text.strip()
            else:
                return "（支援計画の生成に失敗しました。）"
        except Exception as e:
            return f"Gemini API呼び出しエラー: {e}"
