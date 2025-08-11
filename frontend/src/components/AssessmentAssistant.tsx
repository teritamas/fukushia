import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export default function AssessmentAssistant() {
  const [assessmentResult, setAssessmentResult] = useState("");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  // Firestoreから支援者一覧を取得
  useEffect(() => {
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID =
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const fetchClients = async () => {
      const ref = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/clients`
      );
      const snap = await getDocs(ref);
      setClients(snap.docs.map((doc) => doc.data().name));
    };
    fetchClients();
  }, []);

  // Gemini API連携（Pythonバックエンド呼び出し）
  const handleAssessment = async () => {
    if (!selectedClient) {
      setAssessmentError("支援者を選択してください");
      return;
    }
    setAssessmentLoading(true);
    setAssessmentError(null);
    setAssessmentResult("");
    try {
      const APP_ID =
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID =
        process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      const notesRef = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/notes`
      );
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      const notes = snap.docs.map((doc) => doc.data());
      const text = notes
        .map((n) =>
          [
            n.speaker,
            n.content,
            ...(n.todoItems?.map((t: { text: string }) => t.text) || []),
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n---\n");
      const assessment_item_name = "項目名"; // 必要に応じて
      const user_assessment_items = {}; // 必要に応じて
      const res = await fetch("http://localhost:8000/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          assessment_item_name,
          user_assessment_items,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAssessmentResult(data.result);
      } else {
        setAssessmentError(data.error || "APIエラー");
      }
    } catch {
      setAssessmentError("AI提案の取得に失敗しました");
    } finally {
      setAssessmentLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">アセスメント自動提案</h2>
      <div className="mb-4">
        <label className="font-bold mr-2">支援者を選択：</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="">-- 支援者を選択 --</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button
        className="bg-green-500 text-white px-4 py-2 rounded mb-4"
        onClick={handleAssessment}
        disabled={assessmentLoading || !selectedClient}
      >
        AIに提案してもらう
      </button>
      {assessmentLoading && <p>AI提案を生成中...</p>}
      {assessmentError && <p className="text-red-500">{assessmentError}</p>}
      {assessmentResult && (
        <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">
          {assessmentResult}
        </div>
      )}
    </div>
  );
}
