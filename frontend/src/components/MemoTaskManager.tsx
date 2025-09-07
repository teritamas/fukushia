import React, { useEffect, useMemo, useState } from "react";
import MemoList, {
  Note as SharedNote,
  TodoItem as SharedTodo,
} from "./MemoList";
import {
  clientApi,
  notesApi,
  type NoteCreateRequest,
  type NoteUpdateRequest,
} from "../lib/api-client";

// Local shapes for UI state
type DueDateObj = { toDate: () => Date };
type LocalTodoItem = {
  id: string;
  text: string;
  dueDate: string | DueDateObj | null;
  isCompleted: boolean;
};

type LocalNote = {
  id: string;
  clientName: string;
  speaker: string;
  content: string;
  todoItems: LocalTodoItem[];
  timestamp: DueDateObj;
};

export default function MemoTaskManager() {
  // filters
  const [filter, setFilter] = useState<"all" | "incomplete" | "complete">(
    "all",
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
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    speaker: string;
    content: string;
  } | null>(null);

  // load clients
  useEffect(() => {
    const loadClients = async () => {
      try {
        const clientsData = await clientApi.getAll();
        setClients(clientsData.map((client) => client.name).filter(Boolean));
      } catch (error) {
        console.error("Failed to load clients:", error);
      }
    };
    loadClients();
  }, []);

  // load notes
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const notesData = await notesApi.getAll();
        setNotes(
          notesData.map((note) => ({
            id: note.id,
            clientName: note.clientName ?? "",
            speaker: note.speaker ?? "",
            content: note.content ?? "",
            todoItems: (note.todoItems ?? []).map((item) => ({
              id: item.id,
              text: item.text,
              dueDate: item.due_date || null,
              isCompleted: item.is_completed,
            })),
            timestamp: {
              toDate: () => new Date(note.timestamp),
            },
          })),
        );
      } catch (error) {
        console.error("Failed to load notes:", error);
      }
    };
    loadNotes();
  }, []);

  // form helpers
  const handleTaskChange = (
    id: string,
    field: "text" | "dueDate",
    value: string,
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
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
    try {
      const createRequest: NoteCreateRequest = {
        clientName: selectedClient,
        speaker: speaker.trim(),
        content: memoContent.trim(),
      };

      const newNote = await notesApi.create(createRequest);

      setNotes((p) => [
        {
          id: newNote.id,
          clientName: newNote.clientName,
          speaker: newNote.speaker ?? "",
          content: newNote.content ?? "",
          todoItems: newNote.todoItems.map((item) => ({
            id: item.id,
            text: item.text,
            dueDate: item.due_date || null,
            isCompleted: item.is_completed,
          })),
          timestamp: { toDate: () => new Date(newNote.timestamp) },
        },
        ...p,
      ]);
      setMemoContent("");
      setSpeaker("");
      setTasks([{ id: "initial", text: "", dueDate: "", isCompleted: false }]);
    } catch (error) {
      console.error("Failed to save memo:", error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm("このメモを削除してもよろしいですか？");
    if (!ok) return;
    try {
      await notesApi.delete(noteId);
      setNotes((p) => p.filter((n) => n.id !== noteId));
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean,
  ) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    try {
      const todoItems = (note.todoItems || []).map((t) =>
        t.id === taskId ? { ...t, isCompleted } : t,
      );

      const updateRequest: NoteUpdateRequest = {
        todoItems: todoItems.map((item) => ({
          id: item.id,
          text: item.text,
          due_date: typeof item.dueDate === "string" ? item.dueDate : null,
          is_completed: item.isCompleted,
        })),
      };

      await notesApi.update(noteId, updateRequest);
      setNotes((p) =>
        p.map((n) => (n.id === noteId ? { ...n, todoItems } : n)),
      );
    } catch (error) {
      console.error("Failed to toggle task:", error);
    }
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
      <div className="mb-6 p-4 border border-[var(--ginput-border)] rounded-lg bg-[var(--surface)]">
        <div className="mb-2">
          <label className="text-sm text-[var(--muted)] mr-2">支援対象者</label>
          <select
            className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-[var(--foreground)]"
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
            <label className="text-sm text-[var(--muted)] w-16">発言者</label>
            <input
              className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="例: 本人 / 家族"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="bg-[var(--gbtn-hover-bg)] text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale text-[var(--foreground)]"
                onClick={() => setSpeaker("本人")}
              >
                本人
              </button>
              <button
                type="button"
                className="bg-[var(--gbtn-hover-bg)] text-xs px-2 py-1 rounded-lg hover:bg-[var(--gbtn-hover-bg)] hover-scale text-[var(--foreground)]"
                onClick={() => setSpeaker("家族")}
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
          <label className="text-sm font-medium text-[var(--foreground)] block mb-1">
            メモ内容
          </label>
          <textarea
            className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            placeholder="活動や気づき、課題など"
          />
        </div>

        <div className="mb-2">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-[var(--foreground)]">
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
                className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
                value={task.text}
                onChange={(e) =>
                  handleTaskChange(task.id, "text", e.target.value)
                }
                placeholder={`タスク${idx + 1}`}
              />
              <input
                type="date"
                className="border border-[var(--ginput-border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--gbtn-hover-bg)] bg-[var(--surface)] text-[var(--foreground)]"
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
          className="bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:bg-blue-300 text-white px-4 py-2 rounded-lg hover-scale"
          onClick={handleSaveMemo}
          disabled={!canSave}
        >
          保存
        </button>
      </div>

      <h2 className="text-2xl font-semibold mb-3 text-[var(--foreground)]">
        登録済みメモ
      </h2>
      {/* filters */}
      <div className="mb-4 flex gap-2">
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "all" ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface)]"}`}
          onClick={() => setFilter("all")}
        >
          すべて
        </button>
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "incomplete" ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface)]"}`}
          onClick={() => setFilter("incomplete")}
        >
          未完了タスクあり
        </button>
        <button
          className={`px-3 py-1 rounded-full hover-scale ${filter === "complete" ? "bg-[var(--brand-600)] text-white" : "bg-[var(--surface)]"}`}
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
          <div className="relative bg-[var(--surface)] rounded shadow-lg p-4 w-[480px] max-w-[90vw]">
            <h3 className="font-semibold mb-3">メモを編集</h3>
            <div className="mb-2">
              <label className="text-sm text-gray-700">発言者</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  className="border rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--surface)] text-[var(--foreground)]"
                  value={editing.speaker}
                  onChange={(e) =>
                    setEditing({ ...editing, speaker: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="bg-[var(--chip-bg)] text-xs px-2 py-1 rounded hover:bg-[var(--gbtn-hover-bg)] text-[var(--foreground)]"
                  onClick={() => setEditing({ ...editing, speaker: "本人" })}
                >
                  本人
                </button>
                <button
                  type="button"
                  className="bg-[var(--chip-bg)] text-xs px-2 py-1 rounded hover:bg-[var(--gbtn-hover-bg)] text-[var(--foreground)]"
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
                className="px-3 py-1 rounded bg-[var(--brand-600)] hover:bg-[var(--brand-700)] text-white"
                onClick={async () => {
                  const { id, speaker, content } = editing;
                  try {
                    const updateRequest: NoteUpdateRequest = {
                      speaker,
                      content,
                    };

                    await notesApi.update(id, updateRequest);
                    setNotes((p) =>
                      p.map((n) =>
                        n.id === id ? { ...n, speaker, content } : n,
                      ),
                    );
                    setEditing(null);
                  } catch (error) {
                    console.error("Failed to update note:", error);
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
  );
}
