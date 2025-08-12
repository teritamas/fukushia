import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";

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

  // 保存済みアセスメント用
  type SavedAssessment = {
    assessmentData: boolean;
    id: string;
    createdAt: { seconds: number };
    assessment: any; // The nested assessment object
    clientName: string;
  };
  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);

  // 編集中のアセスメントIDを管理
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [editableAssessment, setEditableAssessment] = useState<any>(null);

  // 保存ハンドラ
  const handleSaveAssessment = async () => {
    if (!editingAssessmentId || !editableAssessment) return;

    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const assessmentRef = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`, editingAssessmentId);

    try {
      await updateDoc(assessmentRef, {
        assessment: editableAssessment,
        updatedAt: serverTimestamp()
      });
      // 保存後にローカルのstateを更新
      setSavedAssessments(prev => 
        prev.map(asm => 
          asm.id === editingAssessmentId ? { ...asm, assessment: editableAssessment } : asm
        )
      );
      setEditingAssessmentId(null);
      setEditableAssessment(null);
      alert("アセスメントを更新しました。");
    } catch (error) {
      console.error("Error updating assessment: ", error);
      alert("アセスメントの更新に失敗しました。");
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

  // 支援者選択時にその人のメモとアセスメントを取得
  useEffect(() => {
    if (!selectedClient) {
      setNotes([]);
      setSavedAssessments([]);
      return;
    }
    setLoading(true);
    setAssessmentsLoading(true);
    setAssessmentsError(null);

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
      setNotes(snap.docs.map((doc) => doc.data() as Note));
      setLoading(false);
    };

    const fetchAssessments = async () => {
      try {
        const assessmentsRef = collection(
          db,
          `artifacts/${APP_ID}/users/${USER_ID}/assessments`
        );
        const q = query(
          assessmentsRef,
          where("clientName", "==", selectedClient)
        );
        const snap = await getDocs(q);
        const assessments = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SavedAssessment[];
        // 日付の降順でソート
        assessments.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        console.log(assessments);
        setSavedAssessments(assessments);
      } catch (error) {
        console.error("Error fetching assessments: ", error);
        setAssessmentsError("アセスメント情報の取得に失敗しました。");
      } finally {
        setAssessmentsLoading(false);
      }
    };

    fetchNotes();
    fetchAssessments();
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
            保存されたアセスメント
          </h3>
          {assessmentsLoading && <p>アセスメントを読み込み中...</p>}
          {assessmentsError && <p className="text-red-500">{assessmentsError}</p>}
          {!assessmentsLoading && !assessmentsError && (
            <>
              {savedAssessments.length > 0 ? (
                <div className="space-y-4">
                  {savedAssessments.map((assessmentDoc) => (
                    <div key={assessmentDoc.id} className="bg-white p-4 rounded-lg shadow-md">
                        <div>
                          <div className="flex justify-between items-center">
                            <p className="text-sm font-semibold text-gray-600">
                              作成日時: {new Date(assessmentDoc.createdAt.seconds * 1000).toLocaleString()}
                            </p>
                          </div>
                          <div className="mt-2 space-y-3 text-sm">
                            {assessmentDoc.assessmentData && typeof assessmentDoc.assessmentData === 'object' ? (
                              Object.entries(assessmentDoc.assessmentData).map(([form, categories]) => (
                                <div key={form}>
                                  <h4 className="text-md font-bold text-gray-700 border-b pb-1 mb-2">{form}</h4>
                                  <div className="space-y-2 pl-4">
                                    {categories && typeof categories === 'object' ? (
                                      Object.entries(categories as any).map(([category, value]) => (
                                        <div key={category}>
                                          <p className="font-semibold text-gray-600">{category}</p>
                                          {value && typeof value === 'object' ? (
                                            <ul className="list-disc pl-6 text-gray-500">
                                              {Object.entries(value as any).map(([item, details]: [string, any]) => (
                                                <li key={item}>
                                                  <span className="font-semibold text-gray-600">{item}:</span> {details || 'N/A'} 
                                                </li>
                                              ))}
                                            </ul>
                                          ) : null}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-sm text-gray-500">カテゴリ情報がありません。</p>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500">アセスメントデータがありません。</p>
                            )}
                          </div>
                        </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {selectedClient ? "保存されたアセスメントはありません。" : "支援者を選択すると、保存されたアセスメントが表示されます。"}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
