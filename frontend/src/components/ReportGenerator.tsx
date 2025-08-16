import { useState } from "react";

type Memo = {
  content: string;
  timestamp?: { toDate?: () => Date };
  tags?: string[];
};
interface ReportGeneratorProps {
  selectedClient: string;
  memos: Memo[];
  hasAssessment?: boolean;
}

export default function ReportGenerator({
  selectedClient,
  memos,
  hasAssessment = false,
}: ReportGeneratorProps) {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canGenerate =
    !!selectedClient && memos.length > 0 && !!hasAssessment && !loading;

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    setReport("");
    try {
      // メモをAPI用に整形
      const formattedMemos = memos.map((m) => ({
        case_name: selectedClient,
        content: m.content,
        created_at: m.timestamp?.toDate
          ? m.timestamp.toDate().getTime() / 1000
          : undefined,
        updated_at: m.timestamp?.toDate
          ? m.timestamp.toDate().getTime() / 1000
          : undefined,
        tags: m.tags || [],
      }));
      const API_BASE_URL =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${API_BASE_URL}/reports/activity/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_name: selectedClient,
          memos: formattedMemos,
          tasks: [],
        }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        setError("サーバーから不正な応答が返されました");
        return;
      }
      if (res.ok && data && data.report) {
        setReport(data.report);
      } else {
        setError((data && (data.detail || data.error)) || "APIエラー");
      }
    } catch {
      setError("報告書生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // 警告メッセージを条件に応じて設定
  const missingMessage = !hasAssessment ? "アセスメントが未登録です。" : "";

  return (
    <div className="my-4">
      {canGenerate && (
        <button
          className="bg-purple-600 text-white px-4 py-2 rounded"
          onClick={handleGenerateReport}
        >
          活動報告書を生成
        </button>
      )}
      {(!hasAssessment || memos.length === 0) && (
        <p className="mt-2 text-xs text-gray-600">
          {memos.length === 0 ? "メモがありません。" : ""}
          {missingMessage}
        </p>
      )}
      {loading && <p>生成中...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {report && (
        <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">
          {report}
        </div>
      )}
    </div>
  );
}
