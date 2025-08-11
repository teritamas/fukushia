import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import ClientList from "./ClientList";

export default function ClientDetail() {
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // アセスメント自動提案用
  const [assessmentResult, setAssessmentResult] = useState("");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // アセスメント自動提案ハンドラ
  const handleAssessment = async () => {
    if (!selectedClient) {
      setAssessmentError("支援者を選択してください");
      return;
    }
    setAssessmentLoading(true);
    setAssessmentError(null);
    setAssessmentResult("");
    try {
      const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
      const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
      const notesRef = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`);
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      const notes = snap.docs.map(doc => doc.data());
      const text = notes.map(n => [n.speaker, n.content, ...(n.todoItems?.map((t:any) => t.text) || [])].filter(Boolean).join("\n")).join("\n---\n");
      const assessment_item_name = "項目名";
      const user_assessment_items = {};
      const res = await fetch("http://localhost:8000/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, assessment_item_name, user_assessment_items }),
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

  // Firestoreから支援者一覧を取得
  useEffect(() => {
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const fetchClients = async () => {
      const ref = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/clients`);
      const snap = await getDocs(ref);
      setClients(snap.docs.map((doc) => doc.data().name));
    };
    fetchClients();
  }, []);

  // 支援者選択時にその人のメモを取得
  useEffect(() => {
    if (!selectedClient) return;
    setLoading(true);
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const fetchNotes = async () => {
      const notesRef = collection(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`);
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      setNotes(snap.docs.map(doc => doc.data()));
      setLoading(false);
    };
    fetchNotes();
  }, [selectedClient]);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">支援者ごとの情報</h2>
      <ClientList
        selectedClient={selectedClient}
        setSelectedClient={setSelectedClient}
        clients={clients}
        setClients={setClients}
      />

      {/* アセスメント自動提案機能 */}
      <div className="mb-6">
        <button className="bg-green-500 text-white px-4 py-2 rounded mb-2" onClick={handleAssessment} disabled={assessmentLoading || !selectedClient}>AIに提案してもらう</button>
        {assessmentLoading && <p>AI提案を生成中...</p>}
        {assessmentError && <p className="text-red-500">{assessmentError}</p>}
        {assessmentResult && (
          <div className="bg-gray-100 rounded p-4 whitespace-pre-wrap mt-2">{assessmentResult}</div>
        )}
      </div>

      {loading && <p>読み込み中...</p>}
      {selectedClient && !loading && (
        <div>
          <h3 className="text-lg font-semibold mb-4">{selectedClient} さんのメモ一覧</h3>
          {notes.length === 0 ? (
            <p>メモがありません。</p>
          ) : (
            <div className="grid gap-4">
              {notes.map((note, idx) => {
                let dateStr = "";
                if (note.timestamp && typeof note.timestamp === "object" && note.timestamp.seconds) {
                  dateStr = new Date(note.timestamp.seconds * 1000).toLocaleString();
                }
                return (
                  <div key={idx} className="bg-white rounded shadow p-4 border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-500">{dateStr}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-1">発言者: {note.speaker || "-"}</span>
                    </div>
                    <div className="mb-2">
                      <span className="font-bold">内容:</span>
                      <div className="ml-2 p-2 bg-blue-50 border-l-4 border-blue-400 rounded whitespace-pre-line text-gray-800 font-medium">
                        {note.content || <span className="text-gray-400">(内容なし)</span>}
                      </div>
                    </div>
                    {note.todoItems && note.todoItems.length > 0 && (
                      <div className="mt-2">
                        <span className="font-bold">やることリスト:</span>
                        <ul className="pl-0 mt-1">
                          {note.todoItems.map((item: any, i: number) => {
                            let dueDateStr = "";
                            if (item.dueDate && typeof item.dueDate === "object" && item.dueDate.seconds) {
                              dueDateStr = new Date(item.dueDate.seconds * 1000).toLocaleDateString();
                            } else if (typeof item.dueDate === "string") {
                              dueDateStr = item.dueDate;
                            }
                            const isCompleted = item.isCompleted;
                            return (
                              <li key={i} className={`flex items-center gap-2 py-1 border-b last:border-b-0 ${isCompleted ? 'bg-green-50' : 'bg-yellow-50'}`}>
                                <span className={`inline-block w-5 ${isCompleted ? 'text-green-500' : 'text-yellow-500'}`}>{isCompleted ? '✔️' : '⏳'}</span>
                                <span className={`flex-1 ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.text}</span>
                                {dueDateStr && <span className="text-xs text-gray-500">(期限: {dueDateStr})</span>}
                                <span className={`text-xs ml-2 px-2 py-0.5 rounded ${isCompleted ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>{isCompleted ? '完了' : '未完了'}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
