import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "./ui/button";
import { Send } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SupportAgentChatUIProps {
  clientName: string | null;
  assessmentData: unknown;
  addTaskFromChat?: (task: string) => void;
  onAddResource?: (
    resourceInfo: string | { name: string; exclude?: boolean; reason?: string },
  ) => void;
  embedded?: boolean;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const SupportAgentChatUI: React.FC<SupportAgentChatUIProps> = ({
  clientName,
  assessmentData,
  addTaskFromChat,
  onAddResource,
  embedded = false,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>([]); // チャットから抽出したタスク

  const sendMessage = async () => {
    if (!input.trim() || !clientName) return;
    setLoading(true);
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    try {
      const res = await fetch(`${API_BASE_URL}/interactive_support_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName,
          assessment_data: assessmentData,
          message: input,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply)
        throw new Error(data?.detail || "AI応答取得失敗");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
      // Task: 行を抽出
      const taskLines = data.reply
        .split("\n")
        .filter((line: string) => line.trim().startsWith("Task:"));
      if (taskLines.length > 0) {
        setTasks((prev) => [
          ...prev,
          ...taskLines.map((l: string) => l.replace("Task:", "").trim()),
        ]);
      }
      // 複数の「制度：」出力をすべて抽出
      const resourceRegex =
        /制度[:：]\s*([\w\u3040-\u30FF\u4E00-\u9FFF\uFF10-\uFF19\u3000-\u303F]+)(?:（対象外・(.+?)）)?/g;
      let matchArr;
      let found = false;
      while ((matchArr = resourceRegex.exec(data.reply)) !== null) {
        if (typeof onAddResource === "function") {
          const name = matchArr[1].trim();
          const reason = matchArr[2]?.trim() || "";
          const exclude = !!reason;
          onAddResource({ name, exclude, reason });
          found = true;
        }
      }
      if (!found) {
        // 旧ロジック（制度名＋否定表現）
        const resourceMatch = data.reply.match(
          /制度名[:：]?\s*([\w\u3040-\u30FF\u4E00-\u9FFF\uFF10-\uFF19\u3000-\u303F]+)/,
        );
        let exclude = false;
        let reason = "";
        const negativeMatch = data.reply.match(
          /(対象外|利用できない|該当しない|不可|条件不適合|申請不可|利用不可|対象ではない)/,
        );
        if (negativeMatch) {
          exclude = true;
          const lines = data.reply.split("\n");
          const idx = lines.findIndex((l: string) =>
            l.includes(resourceMatch ? resourceMatch[1] : ""),
          );
          reason =
            lines
              .slice(idx + 1)
              .find(
                (l: string) => negativeMatch[0] && l.includes(negativeMatch[0]),
              ) || negativeMatch[0];
        }
        if (
          resourceMatch &&
          resourceMatch[1] &&
          typeof onAddResource === "function"
        ) {
          onAddResource({ name: resourceMatch[1].trim(), exclude, reason });
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || "AI応答取得失敗");
      } else {
        setError(String(e) || "AI応答取得失敗");
      }
    } finally {
      setLoading(false);
    }
  };

  // タスク追加処理（MemoTaskManager等に渡す）
  const handleAddTask = (task: string) => {
    if (typeof addTaskFromChat === "function") {
      addTaskFromChat(task);
    } else {
      alert(`タスク追加: ${task}`);
    }
    setTasks((prev) => prev.filter((t) => t !== task)); // 追加後はリストから除去
  };

  return (
    <div
      className={
        embedded
          ? "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mt-0 max-h-[420px] overflow-y-auto"
          : "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mt-4"
      }
    >
      <div className="space-y-2 max-h-fit overflow-y-auto mb-2">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`text-md p-2 rounded ${m.role === "user" ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--gbtn-hover-bg)] text-[var(--brand-700)]"}`}
          >
            <span className="font-bold mr-1">
              {m.role === "user" ? "あなた" : "AI"}
            </span>
            <div className="mt-1">
              <ReactMarkdown
                components={{
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  p: ({ node, ...props }) => (
                    <p className="whitespace-pre-wrap text-sm" {...props} />
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-xs text-[var(--muted)]">AI応答中...</div>
        )}
        {error && <div className="text-xs text-red-500">{error}</div>}
        {/* タスク候補表示 */}
        {tasks.length > 0 && (
          <div className="mt-2">
            <div className="text-xs font-bold text-[var(--brand-600)] mb-1">
              AIが抽出したタスク候補:
            </div>
            {tasks.map((task, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[var(--foreground)]">{task}</span>
                <button
                  className="border border-[var(--brand-600)] text-[var(--brand-600)] bg-[var(--surface)] text-xs px-2 py-1 rounded hover:bg-[var(--gbtn-hover-bg)]"
                  onClick={() => handleAddTask(task)}
                >
                  タスクにする
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="例: この人に適した制度を提案してください。〇〇制度ってなんですか？"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          disabled={loading || !clientName}
        />
        <Button
          size="sm"
          className="h-10 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 min-h-[44px] min-w-[44px] md:min-h-auto md:min-w-auto touch-manipulation"
          onClick={() => sendMessage()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default SupportAgentChatUI;
