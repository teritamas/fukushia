import React from "react";
import { Calendar, AlertCircle } from "lucide-react";

// TodoItemの型を拡張して、クライアント名や詳細情報を含める
export interface TaskListItem {
  id: string;
  text: string;
  dueDate: { seconds: number } | string | null;
  isCompleted: boolean;
  noteId?: string;
  clientName: string;
  details?: string;
}

interface TaskListProps {
  tasks: TaskListItem[];
  onToggleTask: (noteId: string, taskId: string, isCompleted: boolean) => void;
  isLoading: boolean;
  showClientName?: boolean;
}

// 期限のフォーマット関数
function formatDueDate(
  dueDateObj: { seconds: number } | string | null | undefined,
): string {
  if (!dueDateObj) return "";
  let date;
  if (typeof dueDateObj === "string") {
    date = new Date(dueDateObj);
  } else if (
    typeof dueDateObj === "object" &&
    "seconds" in dueDateObj &&
    dueDateObj.seconds
  ) {
    date = new Date(dueDateObj.seconds * 1000);
  } else {
    return "";
  }
  return date.toISOString().split("T")[0].replace(/-/g, "/"); // YYYY/MM/DD形式
}

const TaskSkeleton: React.FC = () => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm animate-pulse">
    <div className="flex items-start gap-3">
      <div className="mt-1 h-5 w-5 bg-[var(--chip-bg)] rounded"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-[var(--chip-bg)] rounded w-3/4"></div>
        <div className="h-3 bg-[var(--chip-bg)] rounded w-1/2"></div>
        <div className="h-3 bg-[var(--chip-bg)] rounded w-full"></div>
        <div className="flex items-center gap-4 mt-2">
          <div className="h-4 bg-[var(--chip-bg)] rounded w-12"></div>
          <div className="h-4 bg-[var(--chip-bg)] rounded w-24"></div>
        </div>
      </div>
    </div>
  </div>
);

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onToggleTask,
  isLoading,
  showClientName = true,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <TaskSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="text-center text-[var(--muted)]">タスクはありません。</p>
    );
  }

  const sortedTasks = [...tasks].sort(
    (a, b) => Number(a.isCompleted) - Number(b.isCompleted),
  );

  return (
    <div className="space-y-3">
      {sortedTasks.map((task, index) => (
        <div
          key={`${task.noteId}-${task.id}-${index}`}
          className={`border border-gray-200 rounded-lg p-4 shadow-sm ${
            task.isCompleted ? "bg-gray-50" : "bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={!!task.isCompleted}
              onChange={(e) =>
                onToggleTask(task.noteId!, task.id!, e.target.checked)
              }
              className="mt-1 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <p
                className={`text-sm text-gray-800 ${
                  task.isCompleted ? "line-through text-gray-400" : ""
                }`}
              >
                {task.text}
              </p>
              {showClientName && (
                <p className="text-sm text-gray-600 mt-1">{task.clientName}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm">
                {task.dueDate && (
                  <div className="flex items-center gap-1 text-gray-500 text-xs">
                    <Calendar size={14} />
                    <span>期日: {formatDueDate(task.dueDate)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskList;
