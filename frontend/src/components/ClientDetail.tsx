import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { assessmentItems } from "../lib/assessmentItems";

import ClientList from "./ClientList";
import ReportGenerator from "./ReportGenerator";

export default function ClientDetail() {
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  type TodoItem = {
    text: string;
    dueDate?: { seconds: number } | string;
    isCompleted?: boolean;
  };
  type Note = {
    speaker?: string;
    content?: string;
    timestamp?: { seconds: number };
    todoItems?: TodoItem[];
  };
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  // アセスメント自動提案用
  const [assessmentResult, setAssessmentResult] = useState("");
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentItems, setAssessmentItems] = useState<any>(null);
  const [assessmentItemsLoading, setAssessmentItemsLoading] = useState(false);
  const [assessmentItemsError, setAssessmentItemsError] = useState<string | null>(null);

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
            ...(n.todoItems?.map((t: TodoItem) => t.text) || []),
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n---\n");
      const assessment_item_name = "項目名";
      const user_assessment_items = {};
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

  // 支援者選択時にその人のメモを取得
  useEffect(() => {
    if (!selectedClient) {
      setNotes([]);
      return;
    }
    setLoading(true);
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID =
      process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    
    const fetchNotes = async () => {
      const notesRef = collection(
        db,
        `artifacts/${APP_ID}/users/${USER_ID}/notes`
      );
      const q = query(notesRef, where("clientName", "==", selectedClient));
      const snap = await getDocs(q);
      setNotes(snap.docs.map((doc) => doc.data()));
      setLoading(false);
    };

    fetchNotes();
    setAssessmentItems(assessmentItems);
  }, [selectedClient]);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full p-4">
      {/* 左カラム: メモ入力・一覧 */}
      <div className="flex-1 bg-white rounded-xl shadow-lg p-6 min-w-[320px]">
        <h2 className="text-xl font-bold mb-4 text-blue-900">
          日々の活動メモ入力
        </h2>
        <ClientList
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          clients={clients}
          setClients={setClients}
        />
        {loading && <p>読み込み中...</p>}
        {selectedClient && !loading && (
          <div>
            <h3 className="text-lg font-semibold mb-2">
              {selectedClient} さんのメモ一覧
            </h3>
            {notes.length === 0 ? (
              <p>メモがありません。</p>
            ) : (
              <div className="grid gap-4">
                {notes.map((note, idx) => {
                  let dateStr = "";
                  if (
                    note.timestamp &&
                    typeof note.timestamp === "object" &&
                    note.timestamp.seconds
                  ) {
                    dateStr = new Date(
                      note.timestamp.seconds * 1000
                    ).toLocaleString();
                  }
                  return (
                    <div
                      key={idx}
                      className="bg-gray-50 rounded-lg shadow p-4 border border-gray-200"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">{dateStr}</span>
                        <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-1">
                          発言者: {note.speaker || "-"}
                        </span>
                      </div>
                      <div className="mb-2">
                        <span className="font-bold">内容:</span>
                        <div className="ml-2 p-2 bg-blue-50 border-l-4 border-blue-400 rounded whitespace-pre-line text-gray-800 font-medium">
                          {note.content || (
                            <span className="text-gray-400">(内容なし)</span>
                          )}
                        </div>
                      </div>
                      {note.todoItems && note.todoItems.length > 0 && (
                        <div className="mt-2">
                          <span className="font-bold">やることリスト:</span>
                          <ul className="pl-0 mt-1">
                            {note.todoItems.map((item: TodoItem, i: number) => {
                              let dueDateStr = "";
                              if (
                                item.dueDate &&
                                typeof item.dueDate === "object" &&
                                item.dueDate.seconds
                              ) {
                                dueDateStr = new Date(
                                  item.dueDate.seconds * 1000
                                ).toLocaleDateString();
                              } else if (typeof item.dueDate === "string") {
                                dueDateStr = item.dueDate;
                              }
                              const isCompleted = item.isCompleted;
                              return (
                                <li
                                  key={i}
                                  className={`flex items-center gap-2 py-1 border-b last:border-b-0 ${
                                    isCompleted ? "bg-green-50" : "bg-yellow-50"
                                  }`}
                                >
                                  <span
                                    className={`inline-block w-5 ${
                                      isCompleted
                                        ? "text-green-500"
                                        : "text-yellow-500"
                                    }`}
                                  >
                                    {isCompleted ? "✔️" : "⏳"}
                                  </span>
                                  <span
                                    className={`flex-1 ${
                                      isCompleted
                                        ? "line-through text-gray-400"
                                        : "text-gray-900"
                                    }`}
                                  >
                                    {item.text}
                                  </span>
                                  {dueDateStr && (
                                    <span className="text-xs text-gray-500">
                                      (期限: {dueDateStr})
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs ml-2 px-2 py-0.5 rounded ${
                                      isCompleted
                                        ? "bg-green-200 text-green-800"
                                        : "bg-yellow-200 text-yellow-800"
                                    }`}
                                  >
                                    {isCompleted ? "完了" : "未完了"}
                                  </span>
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
      {/* 右カラム: AI提案・情報整理 */}
      <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
        <div className="bg-green-50 border-l-4 border-green-400 rounded-xl shadow p-4">
          <h3 className="font-bold text-green-700 mb-2">
            AIによる提案と情報整理
          </h3>
          <button
            className="bg-green-500 text-white px-4 py-2 rounded mb-2"
            onClick={handleAssessment}
            disabled={assessmentLoading || !selectedClient}
          >
            AIに提案してもらう
          </button>
          {assessmentLoading && <p>AI提案を生成中...</p>}
          {assessmentError && <p className="text-red-500">{assessmentError}</p>}
          {assessmentResult && (
            <div className="bg-white rounded p-4 whitespace-pre-wrap mt-2 border border-green-200">
              {assessmentResult}
            </div>
          )}
        </div>
        <div className="bg-purple-50 border-l-4 border-purple-400 rounded-xl shadow p-4">
          <h3 className="font-bold text-purple-700 mb-2">
            活動報告書・支払い報告書生成
          </h3>
          <p className="text-sm text-gray-700 mb-2">
            選択中の支援対象者のメモに基づき、報告書を生成します。
          </p>
          <ReportGenerator
            selectedClient={selectedClient}
            memos={notes.map((n) => ({
              ...n,
              content: n.content ?? "",
              timestamp:
                n.timestamp?.seconds !== undefined
                  ? {
                      toDate: () =>
                        new Date((n.timestamp?.seconds ?? 0) * 1000),
                    }
                  : undefined,
            }))}
          />
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-xl shadow p-4">
          <h3 className="font-bold text-yellow-700 mb-2">
            アセスメント項目一覧
          </h3>
          {assessmentItemsLoading && <p>項目を読み込み中...</p>}
          {assessmentItemsError && <p className="text-red-500">{assessmentItemsError}</p>}
          {assessmentItems && !assessmentItemsLoading && (
             <div className="space-y-4 text-sm">
             {Object.entries(assessmentItems).map(([form, categories]) => (
               <div key={form}>
                 <h4 className="text-md font-bold text-gray-700 border-b pb-1 mb-2">{form}</h4>
                 <div className="space-y-2 pl-4">
                   {Object.entries(categories as any).map(([category, value]) => (
                     <div key={category}>
                       <p className="font-semibold text-gray-600">{category}</p>
                       {typeof value !== 'string' && (
                         <ul className="list-disc pl-6 text-gray-500">
                           {Object.keys(value as any).map((item) => (
                             <li key={item}>{item}</li>
                           ))}
                         </ul>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             ))}
           </div>
          )}
          {!selectedClient && <p className="text-sm text-gray-500">支援者を選択すると、アセスメント項目が表示されます。</p>}
        </div>
      </div>
    </div>
  );
}
