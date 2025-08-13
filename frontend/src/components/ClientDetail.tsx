import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp, addDoc, Timestamp } from "firebase/firestore";
import ReportGenerator from "./ReportGenerator";
import ClientResources from "./ClientResources";

interface ClientDetailProps { selectedClient: string; }
export default function ClientDetail({ selectedClient }: ClientDetailProps) {
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

  // アセスメントと支援計画の状態
  type AssessmentItemDetail = {
    summary: string;
    sentiment: string;
  };

  type AssessmentCategory = {
    [item: string]: AssessmentItemDetail;
  };

  type AssessmentForm = {
    [category: string]: AssessmentCategory;
  };

  type AssessmentPlan = {
    id: string;
    createdAt: { seconds: number };
    assessment: {
      [form: string]: AssessmentForm;
    };
    supportPlan?: string;
    clientName: string;
  };
  const [assessmentPlan, setAssessmentPlan] = useState<AssessmentPlan | null>(null);
  const [editableSupportPlan, setEditableSupportPlan] = useState<string>("");
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);

  // メモ / TODO 入力用 draft state
  type TodoDraft = { id: string; text: string; dueDate: string };
  const [speaker, setSpeaker] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [todos, setTodos] = useState<TodoDraft[]>([{ id: 'initial', text: '', dueDate: '' }]);
  const addTodoField = () => setTodos(prev => [...prev, { id: Date.now().toString(), text: '', dueDate: '' }]);
  const removeTodoField = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));
  const updateTodoField = (id: string, key: 'text' | 'dueDate', value: string) => setTodos(prev => prev.map(t => t.id === id ? { ...t, [key]: value } : t));
  const handleSaveClientNote = async () => {
    if (!selectedClient) return;
    if (!memoContent.trim() && todos.every(t => !t.text.trim())) return;
    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const todoItems = todos.filter(t => t.text.trim()).map(t => ({
      id: t.id,
      text: t.text.trim(),
      dueDate: t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
      isCompleted: false
    }));
    try {
      await addDoc(collection(db, `artifacts/${APP_ID}/users/${USER_ID}/notes`), {
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
        todoItems,
        timestamp: Timestamp.now()
      });
      // 再取得でも良いが即時反映
      // Note 型へ合わせる (dueDate は文字列 or {seconds})
      const noteTodoItems = todoItems.map(t => ({
        text: t.text,
        dueDate: t.dueDate ? { seconds: Math.floor((t.dueDate as Timestamp).seconds ?? Date.now()/1000) } : undefined,
        isCompleted: t.isCompleted
      }));
      setNotes(prev => [{ speaker: speaker.trim(), content: memoContent.trim(), todoItems: noteTodoItems, timestamp: { seconds: Math.floor(Date.now()/1000) } }, ...prev]);
      setSpeaker("");
      setMemoContent("");
      setTodos([{ id: 'initial', text: '', dueDate: '' }]);
    } catch (e) {
      console.error(e);
      alert('メモ保存に失敗しました');
    }
  };

  // 支援計画生成用
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // 支援計画の保存ハンドラ
  const handleSaveSupportPlan = async () => {
    if (!assessmentPlan) {
      alert("保存対象のアセスメントがありません。");
      return;
    }

    const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
    const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";
    const assessmentRef = doc(db, `artifacts/${APP_ID}/users/${USER_ID}/assessments`, assessmentPlan.id);

    try {
      await updateDoc(assessmentRef, {
        supportPlan: editableSupportPlan,
        updatedAt: serverTimestamp()
      });
      setAssessmentPlan(prev => prev ? { ...prev, supportPlan: editableSupportPlan } : null);
      alert("支援計画を保存しました。");
    } catch (error) {
      console.error("Error saving support plan: ", error);
      alert("支援計画の保存に失敗しました。");
    }
  };

  // 支援計画生成ハンドラ
  const handleGenerateSupportPlan = async () => {
    if (!assessmentPlan) return;
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch("http://localhost:8000/support-plan/generate/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment_data: assessmentPlan }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditableSupportPlan(data.plan);
      } else {
        setPlanError(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setPlanError(error.message || "支援計画の生成中にクライアント側でエラーが発生しました。");
      } else {
        setPlanError("支援計画の生成中にクライアント側でエラーが発生しました。");
      }
    } finally {
      setPlanLoading(false);
    }
  };

  // 支援者一覧取得は上位コンポーネントに移動済み

  // 支援者選択時にその人のメモと最新のアセスメントを取得
  useEffect(() => {
    if (!selectedClient) {
      setNotes([]);
      setAssessmentPlan(null);
      setEditableSupportPlan("");
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

    const fetchLatestAssessment = async () => {
      setAssessmentPlan(null);
      setEditableSupportPlan("");
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
        })) as AssessmentPlan[];
        
        if (assessments.length > 0) {
          // 日付でソートして最新のものを取得
          assessments.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          const latestAssessment = assessments[0];
          setAssessmentPlan(latestAssessment);
          setEditableSupportPlan(latestAssessment.supportPlan || "");
        }
      } catch (error) {
        console.error("Error fetching assessments: ", error);
        setAssessmentsError("アセスメント情報の取得に失敗しました。");
      } finally {
        setAssessmentsLoading(false);
      }
    };

    fetchNotes();
    fetchLatestAssessment();
  }, [selectedClient]);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full p-4">
      {/* 左カラム: メモ入力・一覧 */}
      <div className="flex-1 bg-white rounded-xl shadow-lg p-6 min-w-[320px]">
        <h2 className="text-xl font-bold mb-4 text-blue-900">
          日々の活動メモ入力
        </h2>
  {/* 支援者選択 UI は上部 ClientWorkspace に統合 */}
        {/* メモ / TODO 入力フォーム */}
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <div className="mb-2 flex items-center gap-2">
            <label className="text-sm text-gray-700 w-14">発言者</label>
            <input value={speaker} onChange={e=>setSpeaker(e.target.value)} placeholder="例: 本人 / 家族" className="flex-1 border rounded px-2 py-1 text-sm" />
            <button type="button" onClick={()=>setSpeaker('本人')} className="text-xs px-2 py-1 bg-gray-200 rounded">本人</button>
          </div>
          <div className="mb-2">
            <label className="text-sm text-gray-700 block mb-1">メモ内容</label>
            <textarea value={memoContent} onChange={e=>setMemoContent(e.target.value)} rows={3} className="w-full border rounded px-2 py-1 text-sm" placeholder="活動や気づき、課題など" />
          </div>
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-gray-700">TODO（タスク化）</label>
              <button type="button" onClick={addTodoField} className="text-xs text-blue-600 hover:underline">＋追加</button>
            </div>
            <div className="space-y-2">
              {todos.map((t,i)=>(
                <div key={t.id} className="flex gap-2 items-center">
                  <input value={t.text} onChange={e=>updateTodoField(t.id,'text',e.target.value)} placeholder={`タスク${i+1}`} className="flex-1 border rounded px-2 py-1 text-xs" />
                  <input type="date" value={t.dueDate} onChange={e=>updateTodoField(t.id,'dueDate',e.target.value)} className="border rounded px-2 py-1 text-xs" />
                  <button type="button" onClick={()=>removeTodoField(t.id)} disabled={todos.length===1} className="text-[10px] text-red-500 disabled:opacity-30">削除</button>
                </div>
              ))}
            </div>
          </div>
          <button disabled={!selectedClient || (!memoContent.trim() && todos.every(t=>!t.text.trim()))} onClick={handleSaveClientNote} className="w-full bg-blue-600 disabled:bg-blue-300 text-white text-sm py-2 rounded">保存</button>
        </div>
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
            アセスメントと支援計画
          </h3>
          {assessmentsLoading && <p>読み込み中...</p>}
          {assessmentsError && <p className="text-red-500">{assessmentsError}</p>}
          {!assessmentsLoading && !assessmentsError && (
            <>
              {assessmentPlan ? (
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <div className="border-b pb-2 mb-3">
                    <p className="text-sm font-semibold text-gray-600">
                      最終更新日時: {new Date(assessmentPlan.createdAt.seconds * 1000).toLocaleString()}
                    </p>
                  </div>
                  

                  {/* アセスメント内容表示 */}
                  <details className="mb-4">
                    <summary className="font-bold text-gray-800 cursor-pointer">アセスメント内容を表示</summary>
                    <div className="mt-2 space-y-3 text-sm p-3 bg-gray-50 rounded-md max-h-60 overflow-y-auto">
                      {assessmentPlan.assessment && typeof assessmentPlan.assessment === 'object' ? (
                        Object.entries(assessmentPlan.assessment).map(([form, categories]) => (
                          <div key={form}>
                            <h5 className="text-md font-bold text-gray-700 border-b pb-1 mb-2">{form}</h5>
                            <div className="space-y-2 pl-4">
                              {categories && typeof categories === 'object' ? (
                                Object.entries(categories as unknown as AssessmentCategory).map(([category, value]) => (
                                  <div key={category}>
                                    <p className="font-semibold text-gray-600">{category}</p>
                                    {value && typeof value === 'object' ? (
                                      <ul className="list-disc pl-6 text-gray-500">
                                        {Object.entries(value as AssessmentItemDetail).map(([item, details]: [string, string]) => (
                                          <li key={item}>
                                            <strong>{item}:</strong> {details || 'N/A'} 
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
                      ) : <p className="text-sm text-gray-500">アセスメントデータがありません。</p>}
                    </div>
                  </details>

                  {/* 支援計画 */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-md font-bold text-gray-800">支援計画</h4>
                      <button
                        onClick={handleGenerateSupportPlan}
                        className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600"
                        disabled={planLoading}
                      >
                        {planLoading ? 'AIで生成中...' : 'AIで計画案を生成'}
                      </button>
                    </div>
                    {planError && <p className="text-red-500 text-sm mb-2">{planError}</p>}
                    <textarea
                      value={editableSupportPlan}
                      onChange={(e) => setEditableSupportPlan(e.target.value)}
                      className="w-full border p-2 rounded mt-1 text-sm"
                      rows={15}
                      placeholder="ここに支援計画を入力・編集してください。"
                    />
                    <button
                      onClick={handleSaveSupportPlan}
                      className="w-full mt-2 bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
                    >
                      この計画を保存
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {selectedClient ? "保存されたアセスメントはありません。" : "支援者を選択してください。"}
                </p>
              )}
            </>
          )}
  </div>
  <ClientResources clientName={selectedClient || null} assessmentData={assessmentPlan} />
      </div>
    </div>
  );
}
