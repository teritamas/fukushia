import logging
from langchain.agents import Tool
from langchain_google_community import GoogleSearchAPIWrapper


def create_google_search_tool(google_api_key: str, google_cse_id: str | None) -> Tool:
    """
    Create a robust Google search tool that safely fetches top results
    and returns structured text (title/link/snippet). Always returns
    an explanatory message instead of None on failures.
    """
    search_api = GoogleSearchAPIWrapper(google_api_key=google_api_key, google_cse_id=google_cse_id)

    def safe_google_search(query: str) -> str:
        """Execute Google search safely and format the results."""
        try:
            # If the query is about systems/benefits without a year, append 2025
            if not any(y in query for y in ["2025", "令和7", "R7"]) and any(
                k in query for k in ["制度", "給付", "補助", "支援", "助成", "要件", "対象"]
            ):
                query += " 2025"

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
            return f"Google検索でエラーが発生しました（再試行/別クエリを検討）: {e}"

    return Tool(
        name="google_search",
        func=safe_google_search,
        description="Google検索を実行し最新の制度・サービス情報を取得する。ローカル検索で不足した場合に使用する。出力はタイトル/リンク/スニペットの一覧。",
    )
