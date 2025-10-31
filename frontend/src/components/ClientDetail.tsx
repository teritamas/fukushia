"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useClientContext } from "./ClientContext";
import {
  clientApi,
  notesApi,
  assessmentsApi,
  type NoteCreateRequest,
  type NoteUpdateRequest,
} from "../lib/api-client";
import ClientResources, { AssessmentDataShape } from "./ClientResources";
import MemoList, { Note as SharedNote } from "./MemoList";
import TaskList, { TaskListItem } from "./TaskList";
import TaskForm from "./TaskForm";
import MemoForm from "./MemoForm";
import SupportAgentChatUI from "./SupportAgentChatUI";
import { Button } from "./ui/button";
import { Bot, X, ListTodo, ClipboardList } from "lucide-react";
import Modal from "./ui/Modal";

interface ClientDetailProps {
  selectedClient: string;
  chatMessage?: string;
  clearChatMessage: () => void;
  chatOpenSignal: number;
}
export default function ClientDetail({
  selectedClient,
  chatMessage,
  clearChatMessage,
  chatOpenSignal,
}: ClientDetailProps) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTaskFormVisible, setIsTaskFormVisible] = useState(false);
  const [isMemoFormVisible, setIsMemoFormVisible] = useState(false);

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
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const toggleAiChatOpen = () => setAiChatOpen((prev) => !prev);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { assessmentRefreshSignal, notifyTaskUpdated } = useClientContext();

  useEffect(() => {
    if (chatOpenSignal > 0) {
      setAiChatOpen(true);
    }
  }, [chatOpenSignal]);
  // Avoid SSR hydration mismatch by rendering portal only after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedClient) {
      setNotes([]);
      setTasks([]);
      return;
    }
    setLoading(true);
    const fetchData = async () => {
      try {
        const clientData = await clientApi.getAll();
        setClients(
          clientData.map((c) => ({ id: c.id || "", name: c.name || "" })),
        );
        const notesData = await notesApi.getAll(selectedClient);
        const allNotes: SharedNote[] = [];
        const allTasks: TaskListItem[] = [];
        notesData.forEach((note) => {
          allNotes.push({
            id: note.id,
            clientName: note.clientName,
            speaker: note.speaker,
            content: note.content,
            timestamp: {
              seconds: Math.floor(new Date(note.timestamp).getTime() / 1000),
            },
          });
          if (note.todoItems) {
            note.todoItems.forEach((item) => {
              allTasks.push({
                id: item.id,
                text: item.text,
                dueDate: item.due_date || null,
                isCompleted: item.is_completed,
                noteId: note.id,
                clientName: selectedClient,
                details: (note.content || "").replace(item.text, "").trim(),
              });
            });
          }
        });
        setNotes(allNotes);
        setTasks(allTasks);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
      setLoading(false);
    };
    fetchData();
  }, [selectedClient]);

  const handleSaveTask = async (task: {
    clientName: string;
    text: string;
    dueDate: string;
  }) => {
    if (!selectedClient) return;
    try {
      const createRequest: NoteCreateRequest = {
        clientName: selectedClient,
        content: task.text,
      };
      let newNote = await notesApi.create(createRequest);
      const updateRequest: NoteUpdateRequest = {
        todoItems: [
          {
            id: "",
            text: task.text,
            due_date: task.dueDate || null,
            is_completed: false,
          },
        ],
      };
      newNote = await notesApi.update(newNote.id, updateRequest);
      const newTodoItem = newNote.todoItems[0];
      setTasks((prev) => [
        ...prev,
        {
          id: newTodoItem.id,
          text: newTodoItem.text,
          dueDate: newTodoItem.due_date || null,
          isCompleted: newTodoItem.is_completed,
          noteId: newNote.id,
          clientName: selectedClient,
          details: (newNote.content || "").replace(newTodoItem.text, "").trim(),
        },
      ]);
      setIsTaskFormVisible(false);
    } catch (error) {
      console.error("Failed to save task:", error);
    }
  };

  const handleSaveMemo = async (memo: {
    clientName: string;
    speaker: string;
    content: string;
  }) => {
    if (!selectedClient) return;
    try {
      const createRequest: NoteCreateRequest = {
        clientName: selectedClient,
        speaker: memo.speaker,
        content: memo.content,
      };
      const newNote = await notesApi.create(createRequest);
      setNotes((prev) => [
        ...prev,
        {
          id: newNote.id,
          clientName: newNote.clientName,
          speaker: newNote.speaker,
          content: newNote.content,
          timestamp: {
            seconds: Math.floor(new Date(newNote.timestamp).getTime() / 1000),
          },
        },
      ]);
      setIsMemoFormVisible(false);
    } catch (error) {
      console.error("Failed to save memo:", error);
    }
  };

  const addTaskFromChat = async (taskText: string) => {
    if (!selectedClient) return;
    try {
      const createRequest: NoteCreateRequest = {
        clientName: selectedClient,
        content: taskText,
      };
      let newNote = await notesApi.create(createRequest);
      const updateRequest: NoteUpdateRequest = {
        todoItems: [
          {
            id: "",
            text: taskText,
            due_date: null,
            is_completed: false,
          },
        ],
      };
      newNote = await notesApi.update(newNote.id, updateRequest);
      const newTodoItem = newNote.todoItems[0];
      setTasks((prev) => [
        ...prev,
        {
          id: newTodoItem.id,
          text: newTodoItem.text,
          dueDate: newTodoItem.due_date || null,
          isCompleted: newTodoItem.is_completed,
          noteId: newNote.id,
          clientName: selectedClient,
          details: (newNote.content || "").replace(newTodoItem.text, "").trim(),
        },
      ]);
      notifyTaskUpdated();
    } catch (error) {
      console.error("Failed to add task from chat:", error);
    }
  };

  const handleToggleTask = async (
    noteId: string,
    taskId: string,
    isCompleted: boolean,
  ) => {
    try {
      const note = await notesApi.get(noteId);
      if (!note) return;
      const todoItems = (note.todoItems || []).map((t) =>
        t.id === taskId ? { ...t, is_completed: isCompleted } : t,
      );
      const updateRequest: NoteUpdateRequest = {
        todoItems: todoItems,
      };
      await notesApi.update(noteId, updateRequest);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId && t.noteId === noteId ? { ...t, isCompleted } : t,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle task:", error);
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

  useEffect(() => {
    const fetchLatestAssessment = async () => {
      if (!selectedClient) return;
      setAssessmentPlan(null);
      setEditableSupportPlan("");
      try {
        const assessments = await assessmentsApi.getAll(selectedClient);

        if (assessments.length > 0) {
          assessments.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          const latestAssessment = assessments[0];

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

    fetchLatestAssessment();
  }, [selectedClient, assessmentRefreshSignal]);

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
    <div className="flex flex-col md:flex-row gap-6 w-full">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 shadow p-4 border border-gray-100 rounded-xl">
          <div className="flex items-center justify-between mb-3 ">
            <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
              <ListTodo className="w-6 h-6 text-blue-500" />
              タスク ({tasks.length})
            </h2>
            <button
              onClick={() => setIsTaskFormVisible(true)}
              className="gbtn tonal text-sm"
            >
              タスク追加
            </button>
          </div>
          <Modal
            isOpen={isTaskFormVisible}
            onClose={() => setIsTaskFormVisible(false)}
          >
            <TaskForm
              defaultClientName={selectedClient}
              onSave={handleSaveTask}
              onCancel={() => setIsTaskFormVisible(false)}
            />
          </Modal>
          <TaskList
            tasks={tasks}
            onToggleTask={handleToggleTask}
            isLoading={loading}
            showClientName={false}
          />
        </div>
        <div className="md:col-span-1 bg-[var(--surface)] shadow p-4 flex flex-col border border-gray-100 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-green-500" />
              支援記録 ({notes.length})
            </h2>
            <button
              onClick={() => setIsMemoFormVisible(true)}
              className="gbtn tonal text-sm"
            >
              支援記録追加
            </button>
          </div>
          <Modal
            isOpen={isMemoFormVisible}
            onClose={() => setIsMemoFormVisible(false)}
          >
            <MemoForm
              defaultClientName={selectedClient}
              onSave={handleSaveMemo}
              onCancel={() => setIsMemoFormVisible(false)}
            />
          </Modal>
          <MemoList notes={notes} showClientName={false} isLoading={loading} />
        </div>
        <div className="flex-1 flex flex-col gap-4 md:col-span-1">
          <div className="bg-[var(--surface)] rounded-xl shadow p-0">
            <ClientResources
              clientName={selectedClient || null}
              hasAssessmentPlan={!!assessmentPlan}
              assessmentData={simplifiedAssessment}
            />
          </div>
        </div>
      </div>
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
                    支援制度提案 Agent
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
                chatMessage={chatMessage}
                clearChatMessage={clearChatMessage}
              />
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
