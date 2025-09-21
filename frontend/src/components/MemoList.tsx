import React from "react";

// 共通の型定義
export type TodoItem = {
  id?: string; // firestoreのtodoItemsにはidがない場合がある
  text: string;
  dueDate?: { seconds: number } | string | null;
  isCompleted?: boolean;
  noteId?: string;
};

export type Note = {
  id: string;
  clientName: string;
  speaker?: string;
  content?: string;
  timestamp?: { seconds: number };
  todoItems?: TodoItem[];
};

// 期限ラベルを返すヘルパー関数
function getDueDateLabel(
  dueDateObj: { seconds: number } | string | null | undefined,
): string {
  if (!dueDateObj) return "";
  if (typeof dueDateObj === "string") {
    return new Date(dueDateObj).toLocaleDateString();
  }
  if (
    typeof dueDateObj === "object" &&
    "seconds" in dueDateObj &&
    dueDateObj.seconds
  ) {
    return new Date(dueDateObj.seconds * 1000).toLocaleDateString();
  }
  return "";
}

interface MemoListProps {
  notes: Note[];
  showClientName?: boolean;
  isLoading?: boolean;
  // オプショナルなハンドラ
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
}

const SkeletonMemo = () => (
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded p-3 mb-2 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="h-4 bg-[var(--chip-bg)] rounded w-1/4"></div>
      <div className="h-4 bg-[var(--chip-bg)] rounded w-1/6"></div>
    </div>
    <div className="mt-2 h-4 bg-[var(--chip-bg)] rounded w-1/2"></div>
    <div className="mt-2 h-10 bg-[var(--chip-bg)] rounded w-full"></div>
  </div>
);

const MemoList: React.FC<MemoListProps> = ({
  notes,
  showClientName = true,
  isLoading = false,
  onEditNote,
  onDeleteNote,
}) => {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        <SkeletonMemo />
        <SkeletonMemo />
        <SkeletonMemo />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="text-center text-[var(--muted)]">メモがありません。</p>
    );
  }

  return (
    <div className="grid gap-4">
      {notes.map((note) => {
        const dateStr = note.timestamp?.seconds
          ? new Date(note.timestamp.seconds * 1000).toLocaleDateString()
          : "";

        return (
          <div
            key={note.id}
            className="bg-[var(--surface)] border border-[var(--border)] rounded p-3 mb-2"
          >
            <div
              className={`flex items-center ${
                showClientName ? "justify-between" : "justify-end"
              }`}
            >
              {showClientName && (
                <div className="font-bold flex items-center gap-2">
                  <span>{note.clientName}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                {note.speaker && (
                  <span className="text-xs text-[var(--muted)]">
                    👤 {note.speaker}
                  </span>
                )}
                <span className="text-xs text-[var(--muted)]">
                  {dateStr || "-"}
                </span>
                {onEditNote && onDeleteNote && (
                  <div className="flex gap-2">
                    <button
                      className="text-[var(--brand-600)] hover:bg-[var(--gbtn-hover-bg)] rounded p-1"
                      title="編集"
                      onClick={() => onEditNote(note)}
                    >
                      <span role="img" aria-label="edit">
                        ✏️
                      </span>
                    </button>
                    <button
                      className="text-red-500 hover:bg-[var(--gbtn-hover-bg)] rounded p-1"
                      title="削除"
                      onClick={() => onDeleteNote(note.id)}
                    >
                      <span role="img" aria-label="delete">
                        🗑️
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {note.content && <div className="mt-1 mb-1 text-sm">{note.content}</div>}
          </div>
        );
      })}
    </div>
  );
};

export default MemoList;
