import React from 'react';

// 共通の型定義
export type TodoItem = {
  id?: string; // firestoreのtodoItemsにはidがない場合がある
  text: string;
  dueDate?: { seconds: number } | string | null;
  isCompleted?: boolean;
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
  if (typeof dueDateObj === 'string') {
    return new Date(dueDateObj).toLocaleDateString();
  }
  if (typeof dueDateObj === 'object' && 'seconds' in dueDateObj && dueDateObj.seconds) {
    return new Date(dueDateObj.seconds * 1000).toLocaleDateString();
  }
  return "";
}


interface MemoListProps {
  notes: Note[];
  // オプショナルなハンドラ
  onToggleTask?: (noteId: string, taskId: string, isCompleted: boolean) => void;
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
}

const MemoList: React.FC<MemoListProps> = ({ notes, onToggleTask, onEditNote, onDeleteNote }) => {
  if (notes.length === 0) {
    return <p>メモがありません。</p>;
  }

  return (
  <div className="grid gap-4">
      {notes.map((note) => {
        const dateStr = note.timestamp?.seconds
          ? new Date(note.timestamp.seconds * 1000).toLocaleString()
          : "";

        const incompleteTasks = (note.todoItems || []).filter((t) => !t.isCompleted);
        const completedTasks = (note.todoItems || []).filter((t) => t.isCompleted);

        return (
      <div key={note.id} className="surface p-3 mb-2">
            <div className="flex items-center justify-between">
              <div className="font-bold flex items-center gap-2">
        <span>{note.clientName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{dateStr || "-"}</span>
                {onEditNote && onDeleteNote && (
                   <div className="flex gap-2">
                    <button
          className="text-[var(--brand-600)] hover:bg-[#e8f0fe] rounded p-1"
                      title="編集"
                      onClick={() => onEditNote(note)}
                    >
                      <span role="img" aria-label="edit">✏️</span>
                    </button>
                    <button
          className="text-red-500 hover:bg-red-100 rounded p-1"
                      title="削除"
                      onClick={() => onDeleteNote(note.id)}
                    >
                      <span role="img" aria-label="delete">🗑️</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {note.speaker && (
              <div className="mt-1">
        <span className="chip">
                  👤 発言者: {note.speaker}
                </span>
              </div>
            )}

            {note.content && (
              <div className="mt-1 mb-1">📝 {note.content}</div>
            )}

            {incompleteTasks.length > 0 && (
              <div className="mt-2">
                <span className="text-sm text-gray-600 flex items-center gap-1">⏳ 未完了タスク:</span>
                {incompleteTasks.map((item, i) => (
                  <div key={item.id || `in-${i}`} className="flex items-center gap-2 bg-yellow-50/70 py-1 px-2 rounded mb-1">
                    {onToggleTask && item.id && (
                       <input
                        type="checkbox"
                        checked={!!item.isCompleted}
                        onChange={(e) => onToggleTask(note.id, item.id!, e.target.checked)}
                      />
                    )}
                    <span>{item.text}</span>
                    {item.dueDate && (
                      <span className="text-xs text-gray-600">(期限: {getDueDateLabel(item.dueDate)})</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="mt-1.5">
                <span className="flex items-center gap-1 text-xs text-gray-500">✔︎ 完了タスク</span>
                {completedTasks.map((item, i) => (
                  <div key={item.id || `co-${i}`} className="flex items-center gap-2 bg-gray-50 py-[2px] px-2 rounded mb-1">
                     {onToggleTask && item.id && (
                       <input
                        type="checkbox"
                        checked={!!item.isCompleted}
                        onChange={(e) => onToggleTask(note.id, item.id!, e.target.checked)}
                      />
                    )}
                    <span className="line-through text-gray-400 text-xs">{item.text}</span>
                    {item.dueDate && (
                      <span className="text-[10px] text-gray-400">期限: {getDueDateLabel(item.dueDate)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MemoList;
