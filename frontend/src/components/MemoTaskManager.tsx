import React, { useEffect, useMemo, useState } from "react";
import MemoList, {
  Note as SharedNote,
  TodoItem as SharedTodo,
} from "./MemoList";
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

// Local shapes matching Firestore payloads we use here
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

const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";

function getCollectionPath(
  app_id: string,
  user_id: string,
  type: "clients" | "notes"
) {
  return `artifacts/${app_id}/users/${user_id}/${type}`;
}

export default function MemoTaskManager() {
  // filters
  const [filter, setFilter] = useState<"all" | "incomplete" | "complete">(
    "all"
  );

  // create form state
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [tasks, setTasks] = useState<
    Array<{ id: string; text: string; dueDate: string; isCompleted: boolean }>
  >([{ id: "initial", text: "", dueDate: "", isCompleted: false }]);

  // list + edit state
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    speaker: string;
    content: string;
  } | null>(null);

  // load clients
  useEffect(() => {
    const run = async () => {
      const ref = collection(db, getCollectionPath(APP_ID, USER_ID, "clients"));
      const snap = await getDocs(ref);
      setClients(snap.docs.map((d) => d.data().name).filter(Boolean));
    };
    run();
  }, []);

  // load notes
  useEffect(() => {
    const run = async () => {
      const ref = collection(db, getCollectionPath(APP_ID, USER_ID, "notes"));
      const q = query(ref, orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      setNotes(
        snap.docs.map((doc) => ({
          id: doc.id,
          clientName: doc.data().clientName ?? "",
          speaker: doc.data().speaker ?? "",
          content: doc.data().content ?? "",
          todoItems: (doc.data().todoItems ?? []) as TodoItem[],
          timestamp: doc.data().timestamp ?? { toDate: () => new Date() },
        }))
      );
    };
    run();
  }, []);

  // form helpers
  const handleTaskChange = (
    id: string,
    field: "text" | "dueDate",
    value: string
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };
  const addTaskField = () =>
    setTasks((p) => [
      ...p,
      { id: String(Date.now()), text: "", dueDate: "", isCompleted: false },
    ]);
  const removeTaskField = (id: string) =>
    setTasks((p) => p.filter((t) => t.id !== id));

  const canSave =
    selectedClient && (memoContent.trim() || tasks.some((t) => t.text.trim()));

  const handleSaveMemo = async () => {
    if (!canSave) return;
    const todoItems: TodoItem[] = tasks
      .filter((t) => t.text.trim())
      .map((t) => ({
        id: t.id,
        text: t.text.trim(),
        dueDate: t.dueDate ? Timestamp.fromDate(new Date(t.dueDate)) : null,
        isCompleted: false,
      }));

    const ref = collection(db, getCollectionPath(APP_ID, USER_ID, "notes"));
    const docRef = await addDoc(ref, {
      clientName: selectedClient,
      speaker: speaker.trim(),
      content: memoContent.trim(),
      todoItems,
      timestamp: Timestamp.now(),
    });

    setNotes((p) => [
      {
        id: docRef.id,
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
        todoItems,
        timestamp: { toDate: () => new Date() },
      },
      ...p,
    ]);
    setMemoContent("");
    setSpeaker("");
    setTasks([{ id: "initial", text: "", dueDate: "", isCompleted: false }]);
  };

  const handleDeleteNote = async (noteId: string) => {
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("このメモを削除してもよろしいですか？");
    if (!ok) return;
    await deleteDoc(
      doc(db, getCollectionPath(APP_ID, USER_ID, "notes"), noteId)
    );
    setNotes((p) => p.filter((n) => n.id !== noteId));
  };

  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean
  ) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const todoItems = (note.todoItems || []).map((t) =>
      t.id === taskId ? { ...t, isCompleted } : t
    );
    await updateDoc(
      doc(db, getCollectionPath(APP_ID, USER_ID, "notes"), noteId),
      { todoItems }
    );
    setNotes((p) => p.map((n) => (n.id === noteId ? { ...n, todoItems } : n)));
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (filter === "incomplete")
        return (n.todoItems || []).some((t) => !t.isCompleted);
      if (filter === "complete")
        return (
          (n.todoItems || []).length > 0 &&
          (n.todoItems || []).every((t) => t.isCompleted)
        );
      return true;
    });
  }, [notes, filter]);

  const sharedNotes: SharedNote[] = useMemo(() => {
    return filteredNotes.map((n) => ({
      id: n.id,
      clientName: n.clientName,
      speaker: n.speaker,
      content: n.content,
      timestamp: {
        seconds: Math.floor(n.timestamp?.toDate?.().getTime?.() / 1000),
      },
      todoItems: (n.todoItems || []).map<SharedTodo>((t) => ({
        id: t.id,
        text: t.text,
        dueDate:
          typeof t.dueDate === "string"
            ? t.dueDate
            : t.dueDate
              ? { seconds: Math.floor(t.dueDate.toDate().getTime() / 1000) }
              : null,
        isCompleted: t.isCompleted,
      })),
    }));
  }, [filteredNotes]);

  return (
    <div>
      {/* Create form */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="mb-2">
          <label className="text-sm text-gray-700 mr-2">支援対象者</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
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
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-16">発言者</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="例: 本人 / 家族"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale"
                onClick={() => setSpeaker("本人")}
              >
                本人
              </button>
              <button
                type="button"
                className="bg-gray-200 text-xs px-2 py-1 rounded-lg hover:bg-gray-300 hover-scale"
                onClick={() => setSpeaker("家族")}
              >
                家族
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            誰の発言かを明記してください（例: 本人 / 家族 / その他関係者）。
          </p>
        </div>

        <div className="mb-2">
          <label className="text-sm font-medium text-gray-800 block mb-1">
            メモ内容
          </label>
          <textarea
            className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            placeholder="活動や気づき、課題など"
          />
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-800">
              TODO（タスク化）
            </label>
            <button
              className="text-[var(--brand-600)] text-xs hover:underline hover-scale"
              onClick={addTaskField}
            >
              ＋追加
            </button>
          </div>
          {tasks.map((task, idx) => (
            <div key={task.id} className="flex items-center gap-2 mb-1">
              <input
                className="border border-gray-300 rounded-lg px-3 py-2 text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={task.text}
                onChange={(e) =>
                  handleTaskChange(task.id, "text", e.target.value)
                }
                placeholder={`タスク${idx + 1}`}
              />
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={task.dueDate}
                onChange={(e) =>
                  handleTaskChange(task.id, "dueDate", e.target.value)
                }
              />
              <button
                className="text-red-500 text-[10px] hover-scale disabled:opacity-30"
                onClick={() => removeTaskField(task.id)}
                disabled={tasks.length === 1}
              >
                削除
              </button>
            </div>
          ))}
        </div>

        <button
          className="bg-blue-600 hover:bg-[var(--brand-700)] disabled:bg-blue-300 text-white px-4 py-2 rounded-lg hover-scale"
          onClick={handleSaveMemo}
          disabled={!canSave}
        >
          保存
        </button>
      </div>

      <h2 className="text-2xl font-semibold mb-3 text-gray-800">
        登録済みメモ
      </h2>
      {/* filters */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setFilter("all")}
        >
          すべて
        </button>
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "incomplete" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setFilter("incomplete")}
        >
          未完了タスクあり
        </button>
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "complete" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setFilter("complete")}
        >
          完了タスクのみ
        </button>
      </div>

      <MemoList
        notes={sharedNotes}
        onToggleTask={handleToggleTask}
        onEditNote={(note) =>
          setEditing({
            id: note.id,
            speaker: note.speaker || "",
            content: note.content || "",
          })
        }
        onDeleteNote={handleDeleteNote}
      />

      {/* simple inline edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setEditing(null)}
          />
          <div className="relative bg-white rounded shadow-lg p-4 w-[480px] max-w-[90vw]">
            <h3 className="font-semibold mb-3">メモを編集</h3>
            <div className="mb-2">
              <label className="text-sm text-gray-700">発言者</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  className="border rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={editing.speaker}
                  onChange={(e) =>
                    setEditing({ ...editing, speaker: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="bg-gray-200 text-xs px-2 py-1 rounded hover:bg-[var(--gbtn-hover-bg)]"
                  onClick={() => setEditing({ ...editing, speaker: "本人" })}
                >
                  本人
                </button>
                <button
                  type="button"
                  className="bg-gray-200 text-xs px-2 py-1 rounded hover:bg-gray-300"
                  onClick={() => setEditing({ ...editing, speaker: "家族" })}
                >
                  家族
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-sm text-gray-700">メモ内容</label>
              <textarea
                className="border rounded px-2 py-1 w-full mt-1 focus:outline-none focus:ring-2 focus:ring-blue-200"
                rows={4}
                value={editing.content}
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200"
                onClick={() => setEditing(null)}
              >
                キャンセル
              </button>
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white"
                onClick={async () => {
                  const { id, speaker, content } = editing;
                  await updateDoc(
                    doc(db, getCollectionPath(APP_ID, USER_ID, "notes"), id),
                    { speaker, content }
                  );
                  setNotes((p) =>
                    p.map((n) => (n.id === id ? { ...n, speaker, content } : n))
                  );
                  setEditing(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
