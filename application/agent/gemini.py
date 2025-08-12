import google.generativeai as genai
from services.utils import relative_date_tool
from agent.natural_language_processor import NaturalLanguageProcessor
import json


class GeminiAgent:
    def __init__(self, api_key: str, model_name: str = 'gemini-2.5-flash-preview-05-20', relative_date_tool_arg=None):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        # 相対日付→絶対日付変換toolを注入
        if relative_date_tool_arg is not None:
            self.relative_date_tool = relative_date_tool_arg
        else:
            self.relative_date_tool = relative_date_tool
        self.nlp_processor = NaturalLanguageProcessor()

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
        print(f"NLP分析結果: {nlp_results}")
        entities = nlp_results["entities"]
        sentiment = nlp_results["sentiment"]
        print(f"抽出されたエンティティ: {[entity.name for entity in entities]}")
        print(f"抽出されたセンチメント: {sentiment}")
        
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
                return response.candidates[0].content.parts[0].text.strip()
            else:
                return "（支援計画の生成に失敗しました。）"
        except Exception as e:
            return f"Gemini API呼び出しエラー: {e}"
