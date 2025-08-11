// 期限ラベルを返す関数
type DueDateObj = { toDate: () => Date };
type TodoItem = {
  id: string;
  text: string;
  dueDate: string | DueDateObj | null;
  isCompleted: boolean;
};
type Note = {
  id: string;
  clientName: string;
  speaker: string;
  content: string;
  todoItems: TodoItem[];
  timestamp: DueDateObj;
};
function getDueDateLabel(
  dueDateObj: DueDateObj | null,
  isCompleted: boolean = false
): { label: string; className: string; icon: string } {
  if (!dueDateObj || !dueDateObj.toDate)
    return { label: "-", className: "", icon: "" };
  const due = dueDateObj.toDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (isCompleted) {
    // 完了タスクは強調しない
    return { label: due.toLocaleDateString(), className: "", icon: "" };
  }
  if (diffDays < 0) {
    return {
      label: `${due.toLocaleDateString()}（期限切れ）`,
      className: "text-red-600 font-bold",
      icon: "⏰",
    };
  } else if (diffDays <= 2) {
    return {
      label: `${due.toLocaleDateString()}（期限間近）`,
      className: "text-orange-500 font-bold",
      icon: "⚠️",
    };
  } else {
    return { label: due.toLocaleDateString(), className: "", icon: "" };
  }
}
import React, { useState, useEffect } from "react";
import { db } from "../firebase";

// .env.localからAPP_ID, USER_IDを取得
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";

// Firestoreコレクションパス生成関数
function getCollectionPath(
  app_id: string,
  user_id: string,
  type: "clients" | "notes"
) {
  return `artifacts/${app_id}/users/${user_id}/${type}`;
}

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

export default function MemoTaskManager() {
  // メモ表示フィルタ: all, incomplete, complete
  const [filterStatus, setFilterStatus] = useState<
    "all" | "incomplete" | "complete"
  >("all");
  // タスク内容変更
  const handleTaskChange = (
    id: string,
    field: string,
    value: string | boolean
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };
  // メモ削除
  const handleDeleteNote = async (noteId: string) => {
    await deleteDoc(
      doc(db, getCollectionPath(APP_ID, USER_ID, "notes"), noteId)
    );
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  // タスク完了状態切替
  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean
  ) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const updatedTodoItems = (note.todoItems || []).map((t: TodoItem) =>
      t.id === taskId ? { ...t, isCompleted } : t
    );
    await updateDoc(
      doc(db, getCollectionPath(APP_ID, USER_ID, "notes"), noteId),
      {
        todoItems: updatedTodoItems,
      }
    );
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, todoItems: updatedTodoItems } : n
      )
    );
  };
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editMemoContent, setEditMemoContent] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [tasks, setTasks] = useState([
    { id: "initial", text: "", dueDate: "", isCompleted: false },
  ]);
  const [notes, setNotes] = useState<Note[]>([]);

  // クライアント一覧取得
  useEffect(() => {
    if (!USER_ID) return;
    const fetchClients = async () => {
      const ref = collection(db, getCollectionPath(APP_ID, USER_ID, "clients"));
      const snap = await getDocs(ref);
      setClients(snap.docs.map((doc) => doc.data().name));
    };
    fetchClients();
  }, []);

  // メモ一覧取得
  useEffect(() => {
    if (!USER_ID) return;
    const fetchNotes = async () => {
      const ref = collection(db, getCollectionPath(APP_ID, USER_ID, "notes"));
      const q = query(ref, orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      setNotes(
        snap.docs.map((doc) => ({
          id: doc.id,
          clientName: doc.data().clientName ?? "",
          speaker: doc.data().speaker ?? "",
          content: doc.data().content ?? "",
          todoItems: doc.data().todoItems ?? [],
          timestamp: doc.data().timestamp ?? { toDate: () => new Date() },
        }))
      );
    };
    fetchNotes();
  }, []);

  // 支援者追加

  // メモ保存
  const handleSaveMemo = async () => {
    if (
      !selectedClient ||
      (!memoContent.trim() && tasks.every((t) => !t.text.trim()))
    )
      return;
    const todoItems = tasks
      .filter((t) => t.text.trim())
      .map((t) => ({
        ...t,
        dueDate: t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
      }));
    const docRef = await addDoc(
      collection(db, getCollectionPath(APP_ID, USER_ID, "notes")),
      {
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
        todoItems,
        timestamp: Timestamp.now(),
      }
    );
    // 追加したメモを即時反映
    setNotes((prev) => [
      {
        id: docRef.id,
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
        todoItems,
        timestamp: { toDate: () => new Date() },
      },
      ...prev,
    ]);
    setMemoContent("");
    setSpeaker("");
    setTasks([{ id: "initial", text: "", dueDate: "", isCompleted: false }]);
  };

  // タスク追加・削除
  const addTaskField = () =>
    setTasks((prev) => [
      ...prev,
      { id: Date.now().toString(), text: "", dueDate: "", isCompleted: false },
    ]);
  const removeTaskField = (id: string) =>
    setTasks((prev) => prev.filter((t) => t.id !== id));

  // タスク内容変更
  return (
    <div>
      {/* メモ・タスク登録フォーム */}
      <div className="mb-6 p-4 border rounded bg-gray-50">
        <div className="mb-2">
          <label className="mr-2">支援者:</label>
          <select
            className="border rounded px-2 py-1"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">選択してください</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-2">
          <label className="mr-2">発言者:</label>
          <input
            className="border rounded px-2 py-1"
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="発言者名"
            style={{ marginRight: "0.5rem" }}
          />
          <button
            type="button"
            className="bg-gray-200 text-xs px-2 py-1 rounded hover:bg-gray-300"
            onClick={() => setSpeaker("本人")}
          >
            本人
          </button>
        </div>
        <div className="mb-2">
          <label className="mr-2">メモ内容:</label>
          <textarea
            className="border rounded px-2 py-1 w-full"
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            placeholder="メモ内容"
          />
        </div>
        <div className="mb-2">
          <label className="mr-2">タスク:</label>
          {tasks.map((task, idx) => (
            <div key={task.id} className="flex items-center gap-2 mb-1">
              <input
                className="border rounded px-2 py-1"
                value={task.text}
                onChange={(e) =>
                  handleTaskChange(task.id, "text", e.target.value)
                }
                placeholder={`タスク${idx + 1}`}
              />
              <input
                type="date"
                className="border rounded px-2 py-1"
                value={task.dueDate}
                onChange={(e) =>
                  handleTaskChange(task.id, "dueDate", e.target.value)
                }
              />
              <button
                className="text-red-500 text-xs"
                onClick={() => removeTaskField(task.id)}
                disabled={tasks.length === 1}
              >
                削除
              </button>
            </div>
          ))}
          <button
            className="text-blue-500 text-xs underline"
            onClick={addTaskField}
          >
            ＋タスク追加
          </button>
        </div>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={handleSaveMemo}
          disabled={
            !selectedClient ||
            (!memoContent.trim() && tasks.every((t) => !t.text.trim()))
          }
        >
          保存
        </button>
      </div>
      <h2 className="text-xl font-bold mb-2">登録済みメモ</h2>
      {/* メモ表示フィルタ切り替えボタン */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-1 rounded ${
            filterStatus === "all" ? "bg-blue-500 text-white" : "bg-gray-200"
          }`}
          onClick={() => setFilterStatus("all")}
        >
          すべて
        </button>
        <button
          className={`px-3 py-1 rounded ${
            filterStatus === "incomplete"
              ? "bg-blue-500 text-white"
              : "bg-gray-200"
          }`}
          onClick={() => setFilterStatus("incomplete")}
        >
          未完了タスクあり
        </button>
        <button
          className={`px-3 py-1 rounded ${
            filterStatus === "complete"
              ? "bg-blue-500 text-white"
              : "bg-gray-200"
          }`}
          onClick={() => setFilterStatus("complete")}
        >
          完了タスクのみ
        </button>
      </div>
      {notes.length === 0 ? (
        <div>メモがありません。</div>
      ) : (
        // フィルタ適用
        notes
          .filter((n: Note) => {
            if (filterStatus === "incomplete") {
              return (n.todoItems || []).some((t: TodoItem) => !t.isCompleted);
            } else if (filterStatus === "complete") {
              return (
                (n.todoItems || []).length > 0 &&
                (n.todoItems || []).every((t: TodoItem) => t.isCompleted)
              );
            }
            return true;
          })
          .map((note: Note) => (
            <div key={note.id} className="">
              {editingNoteId === note.id ? (
                <div className="border rounded p-2 mb-3 bg-yellow-50">
                  <div className="font-bold flex items-center gap-2">
                    <span>{note.clientName}</span>
                    <span className="text-xs text-gray-500">
                      (
                      {note.timestamp?.toDate?.().toLocaleDateString?.() || "-"}
                      )
                    </span>
                  </div>
                  <input
                    type="text"
                    value={editSpeaker}
                    onChange={(e) => setEditSpeaker(e.target.value)}
                    placeholder="発言者"
                    className="border px-2 py-1 rounded w-full mb-2"
                  />
                  <textarea
                    value={editMemoContent}
                    onChange={(e) => setEditMemoContent(e.target.value)}
                    placeholder="メモ内容"
                    className="border px-2 py-1 rounded w-full mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      className="bg-green-500 text-white px-3 py-1 rounded flex items-center gap-1"
                      onClick={async () => {
                        await updateDoc(
                          doc(
                            db,
                            getCollectionPath(APP_ID, USER_ID, "notes"),
                            note.id
                          ),
                          {
                            speaker: editSpeaker,
                            content: editMemoContent,
                          }
                        );
                        setNotes((prev) =>
                          prev.map((n) =>
                            n.id === note.id
                              ? {
                                  ...n,
                                  speaker: editSpeaker,
                                  content: editMemoContent,
                                }
                              : n
                          )
                        );
                        setEditingNoteId(null);
                      }}
                    >
                      💾 保存
                    </button>
                    <button
                      className="bg-gray-300 px-3 py-1 rounded flex items-center gap-1"
                      onClick={() => setEditingNoteId(null)}
                    >
                      ❌ キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border rounded p-2 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold flex items-center gap-2">
                      <span>{note.clientName}</span>
                      <span className="text-xs text-gray-500">
                        (
                        {note.timestamp?.toDate?.().toLocaleDateString?.() ||
                          "-"}
                        )
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="text-blue-500 hover:bg-blue-100 rounded p-1"
                        title="編集"
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setEditSpeaker(note.speaker || "");
                          setEditMemoContent(note.content || "");
                        }}
                      >
                        <span role="img" aria-label="edit">
                          ✏️
                        </span>
                      </button>
                      <button
                        className="text-red-500 hover:bg-red-100 rounded p-1"
                        title="削除"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <span role="img" aria-label="delete">
                          🗑️
                        </span>
                      </button>
                    </div>
                  </div>
                  {note.content && (
                    <div className="mb-1">
                      📝 {note.content}
                      {note.speaker && (
                        <span className="ml-2 text-xs text-gray-500">
                          （発言者: {note.speaker}）
                        </span>
                      )}
                    </div>
                  )}
                  {/* タスク表示（未完了/完了） */}
                  {(() => {
                    const incompleteTasks = (note.todoItems || []).filter(
                      (t: TodoItem) => !t.isCompleted
                    );
                    const completedTasks = (note.todoItems || []).filter(
                      (t: TodoItem) => t.isCompleted
                    );
                    return (
                      <>
                        {incompleteTasks.length > 0 && (
                          <div className="mt-2">
                            <span className="font-bold flex items-center gap-1">
                              ⏳ 未完了タスク:
                            </span>
                            {incompleteTasks.map((item: TodoItem) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 bg-yellow-50 py-1 px-2 rounded mb-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.isCompleted}
                                  onChange={(e) =>
                                    handleToggleTask(
                                      note.id,
                                      item.id,
                                      e.target.checked
                                    )
                                  }
                                />
                                <span>{item.text}</span>
                                {item.dueDate &&
                                  (() => {
                                    const due = getDueDateLabel(
                                      typeof item.dueDate === "string"
                                        ? null
                                        : item.dueDate
                                    );
                                    return (
                                      <span
                                        className={`text-xs ml-1 ${due.className}`}
                                      >
                                        ({due.icon}期限: {due.label})
                                      </span>
                                    );
                                  })()}
                              </div>
                            ))}
                          </div>
                        )}
                        {completedTasks.length > 0 && (
                          <div className="mt-2">
                            <span className="font-bold flex items-center gap-1">
                              ✅ 完了タスク:
                            </span>
                            {completedTasks.map((item: TodoItem) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 bg-green-50 py-1 px-2 rounded mb-1"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.isCompleted}
                                  onChange={(e) =>
                                    handleToggleTask(
                                      note.id,
                                      item.id,
                                      e.target.checked
                                    )
                                  }
                                />
                                <span className="line-through text-gray-400">
                                  {item.text}
                                </span>
                                {item.dueDate &&
                                  (() => {
                                    const due = getDueDateLabel(
                                      typeof item.dueDate === "string"
                                        ? null
                                        : item.dueDate,
                                      true
                                    );
                                    return (
                                      <span className={`text-xs ml-1`}>
                                        期限: {due.label}
                                      </span>
                                    );
                                  })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))
      )}
    </div>
  );
}
