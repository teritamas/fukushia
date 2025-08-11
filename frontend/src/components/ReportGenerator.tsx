import { useState } from "react";

interface ReportGeneratorProps {
  selectedClient: string;
  memos: any[];
}

export default function ReportGenerator({ selectedClient, memos }: ReportGeneratorProps) {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    setReport("");
    try {
      // メモをAPI用に整形
      const formattedMemos = memos.map(m => ({
        case_name: selectedClient,
        content: m.content,
        created_at: m.timestamp?.toDate ? m.timestamp.toDate().getTime() / 1000 : undefined,
        updated_at: m.timestamp?.toDate ? m.timestamp.toDate().getTime() / 1000 : undefined,
        tags: m.tags || [],
      }));
      const res = await fetch("http://localhost:8000/reports/activity/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_name: selectedClient, memos: formattedMemos, tasks: [] }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        setError("サーバーから不正な応答が返されました");
        return;
      }
      if (res.ok && data && data.report) {
        setReport(data.report);
      } else {
        setError((data && (data.detail || data.error)) || "APIエラー");
      }
    } catch (e: any) {
      setError("報告書生成に失敗しました: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-4">
      <button
        className="bg-purple-600 text-white px-4 py-2 rounded"
        onClick={handleGenerateReport}
        disabled={loading || !selectedClient || memos.length === 0}
      >
        活動報告書を生成
      </button>
      {loading && <p>生成中...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {report && (
        <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">{report}</div>
      )}
    </div>
  );
}
