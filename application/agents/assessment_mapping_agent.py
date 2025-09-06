import google.generativeai as genai
import json
import logging

# loggingの設定
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


class AssessmentMappingAgent:
    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-1.5-flash",
    ):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def map_to_assessment_items(self, text_content: str, assessment_items: dict) -> dict:
        """
        面談記録テキストを指定のアセスメント項目構成にマッピングして要約を返す。

        旧実装(df520a1)ではNLP抽出 + Geminiでのマッピングを行っていたが、
        現行ではGemini(GenerativeModel)のみで自己完結するように簡潔化して復元する。
        """
        try:
            items_json = json.dumps(assessment_items, ensure_ascii=False, indent=2)
        except Exception:
            items_json = str(assessment_items)

        prompt = f"""
        あなたは社会福祉士のアセスメント業務を支援するAIアシスタントです。
        以下の「面談記録」を分析し、指定された「アセスメントシートの項目」に沿って、
        関連する情報を整理・要約してください。

        出力は、各アセスメント項目に対応する情報を記述したJSON形式でなければなりません。
        客観的な事実に基づいて記述し、情報がない項目は「該当なし」としてください。

        --- 面談記録 ---
        {text_content}
        ----------------

        --- アセスメントシートの項目 ---
        {items_json}
        ----------------

        次のJSONのみを返してください。説明文や前置きは不要です。
        """

        try:
            resp = self.model.generate_content(prompt)
            # 期待: JSON文字列
            text = ""
            if getattr(resp, "candidates", None):
                c0 = resp.candidates[0]
                parts = getattr(getattr(c0, "content", None), "parts", [])
                if parts:
                    text = getattr(parts[0], "text", "").strip()
            if not text:
                return {"error": "Geminiからの応答がありませんでした。"}

            # フェンス ```json ... ``` を除去
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

            try:
                return json.loads(text)
            except Exception:
                # 緊急フォールバック: 最初の { から最後の } を抽出
                start = text.find("{")
                end = text.rfind("}")
                if start != -1 and end != -1 and end > start:
                    return json.loads(text[start : end + 1])
                return {"error": "Gemini応答のJSON解析に失敗しました。", "raw": text}
        except Exception as e:
            logging.error(f"map_to_assessment_items failed: {e}", exc_info=True)
            return {"error": f"Gemini API呼び出しエラー: {e}"}
