import React, { useEffect, useState, useCallback } from "react";
import TaskList, { TaskListItem } from "./TaskList";
import {
  clientApi,
  notesApi,
  type NoteUpdateRequest,
  type TodoItemAPI,
} from "../lib/api-client";
import { ListTodo, PlusCircle, Lightbulb } from "lucide-react";
import TaskForm from "./TaskForm";
import MemoForm from "./MemoForm";
import { useClientContext } from "./ClientContext";

export default function MemoTaskManager() {
  const [allTasks, setAllTasks] = useState<TaskListItem[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMemoForm, setShowMemoForm] = useState(false);
  const [suggestedTask, setSuggestedTask] = useState("");
  const [suggestedMemo, setSuggestedMemo] = useState("");
  const [hasFetchedSuggestions, setHasFetchedSuggestions] = useState(false);

  const { taskRefreshSignal, currentClient } = useClientContext();

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

  const loadAllTasks = useCallback(async () => {
    if (!currentClient) return;
    setIsLoading(true);
    try {
      const notesData = await notesApi.getAll(currentClient.name);
      const fetchedTasks: TaskListItem[] = [];
      const hasMemos = notesData.some(note => note.content && note.content.trim() !== "");

      notesData.forEach((note) => {
        if (note.todoItems && note.todoItems.length > 0) {
          note.todoItems.forEach((item) => {
            fetchedTasks.push({
              id: item.id,
              text: item.text,
              dueDate: item.due_date || null,
              isCompleted: item.is_completed,
              noteId: note.id,
              clientName: currentClient.name,
              details: (note.content || "").replace(item.text, "").trim(),
            });
          });
        }
      });

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

      // タスクもメモも無い場合のみサジェストを取得
      if (
        fetchedTasks.length === 0 &&
        !hasMemos &&
        !hasFetchedSuggestions
      ) {
        setHasFetchedSuggestions(true);
        try {
          const suggestion = await clientApi.getSuggestion(currentClient.name);
          if (suggestion) {
            if (suggestion.suggested_tasks.length > 0) {
              setSuggestedTask(suggestion.suggested_tasks.join("\n"));
              setShowTaskModal(true);
            }
            if (suggestion.suggested_memo) {
              setSuggestedMemo(suggestion.suggested_memo);
              setShowMemoForm(true);
            }
          }
        } catch (e) {
          console.error("Failed to fetch suggestions", e);
        }
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentClient, hasFetchedSuggestions]);

  useEffect(() => {
    loadAllClients();
  }, []);

  useEffect(() => {
    if (currentClient) {
      setHasFetchedSuggestions(false); // クライアントが変わったら再取得を許可
      loadAllTasks();
    }
  }, [currentClient, taskRefreshSignal, loadAllTasks]);

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
          onClick={() => {
            setShowTaskModal(false);
            setSuggestedTask("");
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-lg shadow-xl w-full max-w-lg"
          >
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold">タスクの追加</h3>
              {suggestedTask && (
                <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded-md mt-2 flex items-center gap-2">
                  <Lightbulb size={16} />
                  <span>AIからの提案です</span>
                </p>
              )}
            </div>
            <div className="p-5">
              <TaskForm
                clients={clients}
                defaultClientName={currentClient?.name}
                initialTaskText={suggestedTask}
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
                    setSuggestedTask("");
                  } catch (error) {
                    console.error("Failed to create task:", error);
                  }
                }}
                onCancel={() => {
                  setShowTaskModal(false);
                  setSuggestedTask("");
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showMemoForm && (
        <div
          className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowMemoForm(false);
            setSuggestedMemo("");
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-lg shadow-xl w-full max-w-lg"
          >
            <div className="p-5 border-b">
              <h3 className="text-lg font-semibold">支援記録の追加</h3>
              {suggestedMemo && (
                <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded-md mt-2 flex items-center gap-2">
                  <Lightbulb size={16} />
                  <span>AIからの提案です</span>
                </p>
              )}
            </div>
            <div className="p-5">
              <MemoForm
                clients={clients}
                defaultClientName={currentClient?.name}
                initialContent={suggestedMemo}
                onSave={async (newMemo) => {
                  try {
                    await notesApi.create({
                      clientName: newMemo.clientName,
                      speaker: newMemo.speaker,
                      content: newMemo.content,
                    });
                    // Here you might want to refresh a list of memos if displayed
                    setShowMemoForm(false);
                    setSuggestedMemo("");
                  } catch (error) {
                    console.error("Failed to save memo:", error);
                  }
                }}
                onCancel={() => {
                  setShowMemoForm(false);
                  setSuggestedMemo("");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
