import React, { useEffect, useState } from "react";
import TaskList, { TaskListItem } from "./TaskList";
import {
  clientApi,
  notesApi,
  type NoteUpdateRequest,
  type TodoItemAPI,
} from "../lib/api-client";
import { ListTodo, PlusCircle } from "lucide-react";
import TaskForm from "./TaskForm";
import MemoForm from "./MemoForm";
import { useClientContext } from "./ClientContext";

export default function MemoTaskManager() {
  const [allTasks, setAllTasks] = useState<TaskListItem[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const { taskRefreshSignal } = useClientContext();

  const loadAllClients = async () => {
    try {
      const clientData = await clientApi.getAll();
      setClients(
        clientData.map((c) => ({ id: c.id || "", name: c.name || "" })),
      );
    } catch (error) {
      console.error("Failed to load clients:", error);
    }
  };

  const loadAllTasks = async () => {
    setIsLoading(true);
    try {
      const clients = await clientApi.getAll();
      const fetchedTasks: TaskListItem[] = [];

      for (const client of clients) {
        if (!client.name) continue;
        const notesData = await notesApi.getAll(client.name);
        notesData.forEach((note) => {
          if (note.todoItems) {
            note.todoItems.forEach((item) => {
              fetchedTasks.push({
                id: item.id,
                text: item.text,
                dueDate: item.due_date || null,
                isCompleted: item.is_completed,
                noteId: note.id,
                clientName: client.name,
                details: (note.content || "").replace(item.text, "").trim(),
              });
            });
          }
        });
      }

      // 期限日でソート
      fetchedTasks.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return (
          new Date(a.dueDate as string).getTime() -
          new Date(b.dueDate as string).getTime()
        );
      });

      setAllTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllTasks();
    loadAllClients();
  }, []);

  useEffect(() => {
    loadAllTasks();
  }, [taskRefreshSignal]);

  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean,
  ) => {
    try {
      const note = await notesApi.get(noteId);
      if (!note) return;

      const todoItems = (note.todoItems || []).map((t: TodoItemAPI) =>
        t.id === taskId ? { ...t, is_completed: isCompleted } : t,
      );

      const updateRequest: NoteUpdateRequest = { todoItems };
      await notesApi.update(noteId, updateRequest);

      // UIの状態を直接更新
      setAllTasks((prev) =>
        prev.map((t) =>
          t.id === taskId && t.noteId === noteId
            ? { ...t, isCompleted: isCompleted }
            : t,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle task:", error);
      // エラーが発生した場合はUIを元に戻すことも検討できる
    }
  };

  return (
    <div className="space-y-6">
      {/* すべてのタスク */}
      <div className="bg-white p-5 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="text-blue-500" />
            <h2 className="text-lg font-bold text-gray-800">すべてのタスク</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTaskModal(true)}
              className="gbtn tonal text-sm"
            >
              <PlusCircle size={16} className="mr-1" />
              タスク追加
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          未完了のタスクが期限日順に表示されます
        </p>
        <TaskList
          tasks={allTasks.filter((t) => !t.isCompleted)}
          onToggleTask={handleToggleTask}
          isLoading={isLoading}
        />
      </div>

      {showTaskModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center bg-black/40 p-4"
          onClick={() => setShowTaskModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-lg shadow-xl w-full max-w-lg"
          >
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold">タスクの追加</h3>
            </div>
            <div className="p-5">
              <TaskForm
                clients={clients}
                onSave={async (newTask: {
                  clientName: string;
                  text: string;
                  dueDate: string;
                }) => {
                  try {
                    const newNote = await notesApi.create({
                      clientName: newTask.clientName,
                      content: newTask.text,
                    });
                    await notesApi.update(newNote.id, {
                      todoItems: [
                        {
                          text: newTask.text,
                          due_date: newTask.dueDate,
                          is_completed: false,
                          id: "", // id is not needed for creation
                        },
                      ],
                    });
                    await loadAllTasks(); // タスクリストを再読み込み
                    setShowTaskModal(false);
                  } catch (error) {
                    console.error("Failed to create task:", error);
                  }
                }}
                onCancel={() => setShowTaskModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
