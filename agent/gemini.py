import google.generativeai as genai

class GeminiAgent:
    def __init__(self, api_key: str, model_name: str = 'gemini-2.5-flash-preview-05-20'):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

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
