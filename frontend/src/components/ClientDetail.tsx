"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useClientContext } from "./ClientContext";
import {
  notesApi,
  assessmentsApi,
  type NoteCreateRequest,
  type NoteUpdateRequest,
} from "../lib/api-client";
import ClientResources, { AssessmentDataShape } from "./ClientResources";
import MemoList, { Note as SharedNote } from "./MemoList";
import SupportAgentChatUI from "./SupportAgentChatUI";
import { Button } from "./ui/button";
import { Bot, X } from "lucide-react";

interface ClientDetailProps {
  selectedClient: string;
}
export default function ClientDetail({ selectedClient }: ClientDetailProps) {
  type TodoItem = {
    id?: string;
    text: string;
    dueDate?: { seconds: number } | string | null;
    isCompleted?: boolean;
  };
  type LocalNote = {
    id?: string;
    clientName?: string;
    speaker?: string;
    content?: string;
    timestamp?: { seconds: number };
    todoItems?: TodoItem[];
  };
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    speaker: string;
    content: string;
  } | null>(null);

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
  const [assessmentPlan, setAssessmentPlan] = useState<AssessmentPlan | null>(
    null,
  );
  const [, setEditableSupportPlan] = useState<string>("");
  const [, setAssessmentsLoading] = useState(false);
  const [, setAssessmentsError] = useState<string | null>(null);
  const [, setIsDragging] = useState(false);
  const [, setDragOffset] = useState({ x: 0, y: 0 });

  // AIチャット用ポップオーバー状態
  const [aiChatOpen, setAiChatOpen] = useState(true);
  const toggleAiChatOpen = () => setAiChatOpen((prev) => !prev);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { assessmentRefreshSignal } = useClientContext();
  // Avoid SSR hydration mismatch by rendering portal only after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // メモ / TODO 入力用 draft state
  type TodoDraft = { id: string; text: string; dueDate: string };
  const [speaker, setSpeaker] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [todos, setTodos] = useState<TodoDraft[]>([
    { id: "initial", text: "", dueDate: "" },
  ]);
  const addTodoField = () =>
    setTodos((prev) => [
      ...prev,
      { id: Date.now().toString(), text: "", dueDate: "" },
    ]);
  // AIチャットからタスク追加
  // AIチャットからタスク追加（即保存＆一覧反映）
  const addTaskFromChat = async (task: string) => {
    if (!selectedClient || !task.trim()) return;
    const newNote: NoteCreateRequest = {
      clientName: selectedClient,
      speaker: "AI",
      content: `AIチャットで「${task}」という確認事項が発生しました。背景：制度やリソースの有無が不明、追加確認が必要なため。`,
    };
    try {
      const createdNote = await notesApi.create(newNote);
      setNotes((prev) => [
        {
          id: createdNote.id,
          clientName: selectedClient,
          speaker: createdNote.speaker,
          content: createdNote.content,
          timestamp: {
            seconds: Math.floor(
              new Date(createdNote.timestamp).getTime() / 1000,
            ),
          },
          todoItems: createdNote.todoItems.map((item) => ({
            id: item.id,
            text: item.text,
            dueDate: item.due_date
              ? {
                  seconds: Math.floor(new Date(item.due_date).getTime() / 1000),
                }
              : null,
            isCompleted: item.is_completed,
          })),
        },
        ...prev,
      ]);
    } catch (e) {
      console.error(e);
      alert("AIタスクの保存に失敗しました");
    }
  };
  const removeTodoField = (id: string) =>
    setTodos((prev) => prev.filter((t) => t.id !== id));
  const updateTodoField = (
    id: string,
    key: "text" | "dueDate",
    value: string,
  ) =>
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)),
    );
  const handleSaveClientNote = async () => {
    if (!selectedClient) return;
    if (!memoContent.trim() && todos.every((t) => !t.text.trim())) return;
    const newNote: NoteCreateRequest = {
      clientName: selectedClient,
      speaker: speaker.trim(),
      content: memoContent.trim(),
    };
    try {
      const createdNote = await notesApi.create(newNote);
      // 即時反映
      setNotes((prev) => [
        {
          id: createdNote.id,
          clientName: selectedClient,
          speaker: createdNote.speaker,
          content: createdNote.content,
          todoItems: createdNote.todoItems.map((t) => ({
            id: t.id,
            text: t.text,
            dueDate: t.due_date
              ? { seconds: Math.floor(new Date(t.due_date).getTime() / 1000) }
              : undefined,
            isCompleted: t.is_completed,
          })),
          timestamp: {
            seconds: Math.floor(
              new Date(createdNote.timestamp).getTime() / 1000,
            ),
          },
        },
        ...prev,
      ]);
      setSpeaker("");
      setMemoContent("");
      setTodos([{ id: "initial", text: "", dueDate: "" }]);
    } catch (e) {
      console.error(e);
      alert("メモ保存に失敗しました");
    }
  };

  // メモの削除
  const handleDeleteNote = async (noteId: string) => {
    try {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("このメモを削除してもよろしいですか？");
      if (!ok) return;
      await notesApi.delete(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e) {
      console.error(e);
      alert("メモの削除に失敗しました");
    }
  };

  // タスクの完了切替
  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean,
  ) => {
    try {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const updated = (note.todoItems || []).map((t) =>
        t?.id === taskId ? { ...t, isCompleted } : t,
      );

      const updateRequest: NoteUpdateRequest = {
        speaker: note.speaker,
        content: note.content,
        todoItems: updated.map((t) => ({
          id: t?.id || "",
          text: t?.text || "",
          due_date:
            typeof t?.dueDate === "object" &&
            t?.dueDate &&
            "seconds" in t.dueDate
              ? new Date(t.dueDate.seconds * 1000).toISOString()
              : typeof t?.dueDate === "string"
                ? t.dueDate
                : null,
          is_completed: t?.isCompleted || false,
        })),
      };

      await notesApi.update(noteId, updateRequest);
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, todoItems: updated } : n)),
      );
    } catch (e) {
      console.error(e);
      alert("タスクの更新に失敗しました");
    }
  };
  const simplifiedAssessment: AssessmentDataShape | null = useMemo(() => {
    if (!assessmentPlan || !assessmentPlan.assessment) return null;
    type SimplifiedCategory = Record<string, string | Record<string, string>>;
    const out: AssessmentDataShape = {
      assessment: {} as Record<string, SimplifiedCategory>,
    };

    const isDetail = (obj: unknown): obj is AssessmentItemDetail =>
      typeof obj === "object" &&
      obj !== null &&
      "summary" in (obj as Record<string, unknown>) &&
      "sentiment" in (obj as Record<string, unknown>);

    Object.entries(assessmentPlan.assessment).forEach(([form, categories]) => {
      if (!categories || typeof categories !== "object") return;
      const formObj: Record<string, string | Record<string, string>> = {};
      Object.entries(categories).forEach(([category, items]) => {
        if (!items || typeof items !== "object") return;
        if (isDetail(items)) {
          const summary = items.summary?.trim() || "";
          const sentiment = items.sentiment?.trim() || "";
          if (summary || sentiment) {
            formObj[category] = sentiment
              ? `${summary}\n(所感:${sentiment})`
              : summary;
          }
          return;
        }
        const catObj: Record<string, string> = {};
        Object.entries(items as AssessmentCategory).forEach(
          ([itemKey, detail]) => {
            if (!detail || typeof detail !== "object") return;
            const summary = detail.summary?.trim() || "";
            const sentiment = detail.sentiment?.trim() || "";
            if (summary || sentiment) {
              catObj[itemKey] = sentiment
                ? `${summary}\n(所感:${sentiment})`
                : summary;
            }
          },
        );
        if (Object.keys(catObj).length === 1) {
          formObj[category] = Object.values(catObj)[0];
        } else if (Object.keys(catObj).length > 0) {
          formObj[category] = catObj;
        }
      });
      if (Object.keys(formObj).length > 0) {
        (out.assessment as Record<string, SimplifiedCategory>)[form] =
          formObj as SimplifiedCategory;
      }
    });

    if (!out.assessment || Object.keys(out.assessment).length === 0) {
      // fallback minimal form to avoid null (keeps downstream UI informative)
      out.assessment = {
        _raw: {
          dump: JSON.stringify(assessmentPlan.assessment).slice(0, 4000),
        },
      } as Record<string, SimplifiedCategory>;
    }
    return out;
  }, [assessmentPlan]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  };

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

    const fetchNotes = async () => {
      try {
        const apiNotes = await notesApi.getAll(selectedClient);
        setNotes(
          apiNotes.map((note) => ({
            id: note.id,
            clientName: selectedClient,
            speaker: note.speaker,
            content: note.content,
            timestamp: {
              seconds: Math.floor(new Date(note.timestamp).getTime() / 1000),
            },
            todoItems: note.todoItems.map((item) => ({
              id: item.id,
              text: item.text,
              dueDate: item.due_date
                ? {
                    seconds: Math.floor(
                      new Date(item.due_date).getTime() / 1000,
                    ),
                  }
                : null,
              isCompleted: item.is_completed,
            })),
          })),
        );
      } catch (error) {
        console.error("Error fetching notes:", error);
      }
      setLoading(false);
    };

    const fetchLatestAssessment = async () => {
      setAssessmentPlan(null);
      setEditableSupportPlan("");
      try {
        const assessments = await assessmentsApi.getAll(selectedClient);

        if (assessments.length > 0) {
          // 日付でソートして最新のものを取得
          assessments.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          const latestAssessment = assessments[0];

          // AssessmentPlan形式に変換
          const convertedAssessment: AssessmentPlan = {
            id: latestAssessment.id,
            createdAt: {
              seconds: Math.floor(
                new Date(latestAssessment.created_at).getTime() / 1000,
              ),
            },
            assessment: latestAssessment.assessment as {
              [form: string]: AssessmentForm;
            },
            supportPlan: latestAssessment.support_plan || "",
            clientName: latestAssessment.client_name,
          };

          setAssessmentPlan(convertedAssessment);
          setEditableSupportPlan(convertedAssessment.supportPlan || "");
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
  }, [selectedClient, assessmentRefreshSignal]);

  // ESCでポップオーバーを閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAiChatOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full p-4">
      {/* 左カラム: メモ入力・一覧 */}
      <div className="flex-1 bg-[var(--surface)] rounded-xl card-shadow border border-[var(--border)] p-6 min-w-[65%]">
        <h2 className="text-2xl font-semibold mb-4 text-[var(--foreground)]">
          メモ・TODOを入力
        </h2>
        {/* メモ / TODO 入力フォーム */}
        <div className="mb-6 p-4 border border-[var(--ginput-border)] rounded-lg bg-[var(--surface)]">
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--muted)] w-16">発言者</label>
              <input
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                placeholder="例: 本人 / 家族 / その他関係者"
                className="flex-1 border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSpeaker("本人")}
                  className="text-xs px-2 py-1 bg-[var(--gbtn-hover-bg)] rounded-lg hover-scale text-[var(--foreground)]"
                >
                  本人
                </button>
                <button
                  type="button"
                  onClick={() => setSpeaker("家族")}
                  className="text-xs px-2 py-1 bg-[var(--gbtn-hover-bg)] rounded-lg hover-scale text-[var(--foreground)]"
                >
                  家族
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              誰の発言かを明記してください（例: 本人 / 家族 / その他関係者）。
            </p>
          </div>
          <div className="mb-2">
            <label className="text-sm font-medium text-gray-800 block mb-1">
              メモ内容
            </label>
            <textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              rows={3}
              className="w-full border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
              placeholder="活動や気づき、課題など"
            />
          </div>
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-800">
                TODO（タスク化）
              </label>
              <button
                type="button"
                onClick={addTodoField}
                className="text-xs text-[var(--brand-600)] hover:underline hover-scale"
              >
                ＋追加
              </button>
            </div>
            <div className="space-y-2">
              {todos.map((t, i) => (
                <div key={t.id} className="flex gap-2 items-center">
                  <input
                    value={t.text}
                    onChange={(e) =>
                      updateTodoField(t.id, "text", e.target.value)
                    }
                    placeholder={`タスク${i + 1}`}
                    className="flex-1 border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--surface)] text-[var(--foreground)]"
                  />
                  <input
                    type="date"
                    value={t.dueDate}
                    onChange={(e) =>
                      updateTodoField(t.id, "dueDate", e.target.value)
                    }
                    className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--surface)] text-[var(--foreground)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeTodoField(t.id)}
                    disabled={todos.length === 1}
                    className="text-[10px] text-red-500 disabled:opacity-30 hover-scale"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button
            disabled={
              !selectedClient ||
              (!memoContent.trim() && todos.every((t) => !t.text.trim()))
            }
            onClick={handleSaveClientNote}
            className="w-full bg-blue-600 hover:bg-[var(--brand-700)] disabled:bg-blue-300 text-white text-sm py-2 rounded-lg hover-scale"
          >
            保存
          </button>
        </div>
        {loading && <p>読み込み中...</p>}
        {selectedClient && !loading && (
          <div>
            <h3 className="text-xl font-semibold mb-3">
              {selectedClient} さんのメモ・TODO一覧
            </h3>
            <MemoList
              notes={
                (notes as LocalNote[]).map((n, i) => ({
                  id: String(n.id ?? i),
                  clientName: selectedClient,
                  speaker: n.speaker,
                  content: n.content,
                  timestamp: n.timestamp,
                  todoItems: (n.todoItems || []).map((t) => ({
                    id: t?.id,
                    text: t?.text,
                    dueDate:
                      typeof t?.dueDate === "string"
                        ? t.dueDate
                        : typeof t?.dueDate === "object" &&
                            t?.dueDate &&
                            "seconds" in t.dueDate
                          ? {
                              seconds: (t.dueDate as { seconds: number })
                                .seconds,
                            }
                          : null,
                    isCompleted: t?.isCompleted,
                  })),
                })) as SharedNote[]
              }
              onToggleTask={handleToggleTask}
              onEditNote={(note) =>
                setEditing({
                  id: note.id,
                  speaker: note.speaker || "",
                  content: note.content || "",
                })
              }
              onDeleteNote={(noteId) => handleDeleteNote(noteId)}
            />

            {editing && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/30"
                  onClick={() => setEditing(null)}
                />
                <div className="relative bg-[var(--surface)] rounded-lg card-shadow p-4 w-[480px] max-w-[90vw] border border-[var(--border)]">
                  <h3 className="font-semibold mb-3">メモを編集</h3>
                  <div className="mb-2">
                    <label className="text-sm text-gray-800">発言者</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        value={editing.speaker}
                        onChange={(e) =>
                          setEditing({ ...editing, speaker: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale"
                        onClick={() =>
                          setEditing({ ...editing, speaker: "本人" })
                        }
                      >
                        本人
                      </button>
                      <button
                        type="button"
                        className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-gray-300 hover-scale"
                        onClick={() =>
                          setEditing({ ...editing, speaker: "家族" })
                        }
                      >
                        家族
                      </button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-sm text-gray-800">メモ内容</label>
                    <textarea
                      className="border border-gray-300 rounded-lg px-3 py-2 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      rows={4}
                      value={editing.content}
                      onChange={(e) =>
                        setEditing({ ...editing, content: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 hover-scale"
                      onClick={() => setEditing(null)}
                    >
                      キャンセル
                    </button>
                    <button
                      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-[var(--brand-700)] text-white hover-scale"
                      onClick={async () => {
                        try {
                          const { id, speaker, content } = editing;

                          // 現在のメモを取得してtodo_itemsを保持
                          const currentNote = notes.find((n) => n.id === id);
                          const todo_items = (currentNote?.todoItems || []).map(
                            (t) => ({
                              id: t?.id || "",
                              text: t?.text || "",
                              due_date:
                                typeof t?.dueDate === "object" &&
                                t?.dueDate &&
                                "seconds" in t.dueDate
                                  ? new Date(
                                      t.dueDate.seconds * 1000,
                                    ).toISOString()
                                  : typeof t?.dueDate === "string"
                                    ? t.dueDate
                                    : null,
                              is_completed: t?.isCompleted || false,
                            }),
                          );

                          const updateRequest: NoteUpdateRequest = {
                            speaker,
                            content,
                            todoItems: todo_items,
                          };

                          await notesApi.update(id, updateRequest);
                          setNotes((p) =>
                            p.map((n) =>
                              n.id === id ? { ...n, speaker, content } : n,
                            ),
                          );
                          setEditing(null);
                        } catch (e) {
                          console.error(e);
                          alert("メモの更新に失敗しました");
                        }
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 右カラム: 情報・生成セクション（順序変更） */}
      <div className="flex-1 flex flex-col gap-4 min-w-[320px]">
        {/* ClientResources: pass simplified assessment for suggestions (may be null if no data) */}
        <div className="bg-[var(--surface)] rounded-xl shadow p-0">
          <ClientResources
            clientName={selectedClient || null}
            hasAssessmentPlan={!!assessmentPlan}
            assessmentData={simplifiedAssessment}
          />
        </div>
      </div>

      {/* AIチャット: タスク化連携 */}
      <div className="relative">
        <div className="fixed md:bottom-6 md:right-6 bottom-3 right-3 z-50">
          <Button
            onClick={() => toggleAiChatOpen()}
            className="h-14 w-14 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 animate-pulse"
          >
            <Bot className="h-6 w-6 text-white" />
          </Button>
        </div>
        {aiChatOpen &&
          mounted &&
          document.body &&
          createPortal(
            <div
              ref={popoverRef}
              className="fixed md:bottom-6 bottom-18 z-50 left-1/2 -translate-x-1/2 md:w-[80vw] w-[90vw] bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden"
              role="dialog"
              aria-label="AI チャット"
            >
              <div
                className="flex items-center justify-between p-3 md:p-2 border-b bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-t-lg touch-manipulation"
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
              >
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5" />
                  <h3 className="font-semibold text-sm md:text-base">
                    福祉支援提案アシスタント
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAiChatOpen(false)}
                  className="text-white hover:bg-white/20 touch-manipulation min-h-[44px] min-w-[44px] md:min-h-auto md:min-w-auto"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SupportAgentChatUI
                clientName={selectedClient}
                assessmentData={simplifiedAssessment}
                addTaskFromChat={addTaskFromChat}
                embedded
              />
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
