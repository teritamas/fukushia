"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "./ui/button";
import { Send, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thought?: string;
}

interface SupportAgentChatUIProps {
  clientName: string | null;
  assessmentData: unknown;
  addTaskFromChat?: (task: string) => void;
  onAddResource?: (
    resourceInfo: string | { name: string; exclude?: boolean; reason?: string },
  ) => void;
  embedded?: boolean;
  chatMessage?: string;
  clearChatMessage?: () => void;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const SupportAgentChatUI: React.FC<SupportAgentChatUIProps> = ({
  clientName,
  assessmentData,
  addTaskFromChat,
  onAddResource,
  embedded = false,
  chatMessage,
  clearChatMessage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showInitialButton, setShowInitialButton] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>([]); // チャットから抽出したタスク
  const [deliberationLine, setDeliberationLine] = useState<string>("");
  const [expandedThoughtIndex, setExpandedThoughtIndex] = useState<
    number | null
  >(null);

  const sendMessage = async (messageContent?: string) => {
    const message = messageContent || input;
    if (!message.trim() || !clientName) return;
    setShowInitialButton(false);
    setLoading(true);
    setError(null);
    // Streaming前に状態を初期化
    hasFinalRef.current = false;
    preludeEndIndexRef.current = -1;
    setDeliberationLine("");
    const userMsg: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMsg]);
    if (!messageContent) {
      setInput("");
    }

    const fullPayload = {
      client_name: clientName,
      assessment_data: assessmentData,
      message: message,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/interactive_support_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPayload),
      });

      // non-stream fallback (json)
      const contentType = res.headers.get("content-type") || "";
      if (!res.body || !contentType.includes("text/event-stream")) {
        const data = await res.json();
        if (!res.ok || !data.reply)
          throw new Error(data?.detail || "AI応答取得失敗");

        const raw: string = String(data.reply);
        const m = raw.match(FINAL_TAG_RE);
        if (m) {
          const idx = raw.indexOf(m[0]);
          setDeliberationLine("");
          const prelude = raw.slice(0, idx);
          const finalPart = stripTaskHeader(raw);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: finalPart,
              thought: prelude,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: stripTaskHeader(raw),
            },
          ]);
        }
        processFinalReply(raw);
        return;
      }

      // streaming path: read SSE-like chunks from body
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";
      let accumulated = ""; // full reply
      // create an assistant placeholder
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = !!streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          // parse SSE frames separated by \n\n
          const parts = buffer.split("\n\n");
          // keep last partial
          buffer = parts.pop() || "";
          for (const part of parts) {
            const lines = part
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length === 0) continue;
            let eventType = "";
            const dataLines: string[] = [];
            for (const l of lines) {
              if (l.startsWith("event:")) {
                eventType = l.replace(/^event:\s*/, "");
              } else if (l.startsWith("data:")) {
                dataLines.push(l.replace(/^data:\s*/, ""));
              }
            }
            // handle data payloads
            if (dataLines.length > 0) {
              // join multiple data lines
              const dataText = dataLines.join("\n");
              try {
                // backend sends JSON strings like {"chunk": "..." }
                if (dataText === "[DONE]") {
                  // noop here, finalization handled by event:done
                } else {
                  const parsed = JSON.parse(dataText);
                  if (parsed && typeof parsed.chunk === "string") {
                    accumulated += parsed.chunk;
                    updateStreamingView(accumulated);
                  } else if (typeof parsed === "string") {
                    accumulated += parsed;
                    updateStreamingView(accumulated);
                  }
                }
              } catch {
                // if not JSON, append raw
                accumulated += dataText;
                updateStreamingView(accumulated);
              }
            }
            if (eventType === "done") {
              // finish
              done = true;
              break;
            }
          }
        }
      }

      // streaming finished -> finalize content and process accumulated final reply
      if (!hasFinalRef.current) {
        updateLastAssistantContent(accumulated);
        // Thoughtは最終出力には表示しない（Final Answerタグ未検出時）
        setMessages((prev) => {
          const idx = prev.map((m) => m.role).lastIndexOf("assistant");
          if (idx === -1) return prev;
          const copy = prev.slice();
          const current = copy[idx];
          copy[idx] = { role: current.role, content: current.content };
          return copy;
        });
      }
      processFinalReply(accumulated);
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

  useEffect(() => {
    if (chatMessage) {
      sendMessage(chatMessage);
      if (clearChatMessage) {
        clearChatMessage();
      }
    }
  }, [chatMessage, clearChatMessage]);

  useEffect(() => {
    // clientName が変更されたら、メッセージをリセットし、最初の挨拶を追加する
    if (clientName) {
      setMessages([
        {
          role: "assistant",
          content: "こんにちは。どのようなご相談でしょうか？",
        },
      ]);
    } else {
      setMessages([]);
    }
  }, [clientName]);

  // popover state (button open / hover / pin)
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const hoverTimeout = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const popoverMessagesRef = useRef<HTMLDivElement | null>(null);

  const FINAL_TAG_RE = /Final Answer[:：]\s*/i;
  const hasFinalRef = useRef(false);
  const preludeEndIndexRef = useRef<number>(-1);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    // ポップオーバーのメッセージリストを最下部へ
    if (popoverMessagesRef.current) {
      const el = popoverMessagesRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    // コンテナ自体も最下部へ（入力欄まで含めて表示）
    if (scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else if (bottomRef.current) {
      // フォールバック（sentinel）
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
  };

  useEffect(() => {
    // メッセージ/ローディング/検討表示の更新で常に最下部へ
    scrollToBottom("smooth");
  }, [messages, loading, deliberationLine]);

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) {
        window.clearTimeout(hoverTimeout.current);
      }
    };
  }, []);

  const openTemporary = () => {
    if (!pinned) {
      setOpen(true);
      if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current);
    }
  };
  const closeTemporary = () => {
    if (!pinned) {
      // small delay to avoid flicker
      hoverTimeout.current = window.setTimeout(() => setOpen(false), 150);
    }
  };

  const togglePin = () => {
    setPinned((v) => !v);
    if (!pinned) setOpen(true);
  };

  const updateLastAssistantContent = (newContent: string) => {
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf("assistant");
      if (idx === -1) {
        return [...prev, { role: "assistant", content: newContent }];
      }
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], content: newContent };
      return copy;
    });
    // 次フレームでスクロール（連続ストリームでも追従）
    requestAnimationFrame(() => scrollToBottom());
  };

  const toOneLine = (s: string) => s.replace(/\s+/g, " ").trim();

  const stripTaskHeader = (s: string) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("Task:"))
      .join("\n");

  const updateLastAssistantThought = (thought: string) => {
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf("assistant");
      if (idx === -1) return prev;
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], thought };
      return copy;
    });
    // 次フレームでスクロール
    requestAnimationFrame(() => scrollToBottom());
  };

  const updateStreamingView = (raw: string) => {
    if (!hasFinalRef.current) {
      const m = raw.match(FINAL_TAG_RE);
      if (m) {
        const idx = raw.indexOf(m[0]);
        const prelude = raw.slice(0, idx);
        preludeEndIndexRef.current = idx + m[0].length;
        hasFinalRef.current = true;
        setDeliberationLine("");
        updateLastAssistantThought(prelude);
        const finalSeg = stripTaskHeader(raw.slice(preludeEndIndexRef.current));
        updateLastAssistantContent(finalSeg);
      } else {
        setDeliberationLine(toOneLine(raw));
        updateLastAssistantThought(raw);
      }
    } else {
      const finalSeg = stripTaskHeader(raw.slice(preludeEndIndexRef.current));
      updateLastAssistantContent(finalSeg);
    }
    // streaming chunk追加ごとにスクロール追従（embeddedモードでも確実に呼ぶ）
    requestAnimationFrame(() => scrollToBottom());
    if (embedded) {
      requestAnimationFrame(() => scrollToBottom());
    }
  };

  // AIのレスポンスからタスクを抽出し、リソースを追加する処理
  const processFinalReply = (reply: string) => {
    // Task extraction
    const taskLines = reply
      .split("\n")
      .filter((line: string) => line.trim().startsWith("Task:"));
    if (taskLines.length > 0) {
      setTasks((prev) => [
        ...prev,
        ...taskLines.map((l: string) => l.replace("Task:", "").trim()),
      ]);
    }

    // Resource extraction (multiple matches)
    const resourceRegex =
      /(?:制度|推奨制度候補)[:：]\s*([\w----]+)(?:（対象外・(.+?)）)?/g;
    let matchArr;
    let found = false;
    try {
      while ((matchArr = resourceRegex.exec(reply)) !== null) {
        if (typeof onAddResource === "function") {
          const name = matchArr[1].trim();
          const reason = matchArr[2]?.trim() || "";
          const exclude = !!reason;
          onAddResource({ name, exclude, reason });
          found = true;
        }
      }
    } catch {
      // ignore regex errors
    }
    if (!found) {
      const resourceMatch = reply.match(/制度名[:：]?\s*([\w----]+)/);
      let exclude = false;
      let reason = "";
      const negativeMatch = reply.match(
        /(対象外|利用できない|該当しない|不可|条件不適合|申請不可|利用不可|対象ではない)/,
      );
      if (negativeMatch) {
        exclude = true;
        const lines = reply.split("\n");
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

  // UI: when embedded just show original card; when not embedded show a floating button that opens popover
  if (!embedded) {
    return (
      <div className="relative inline-block">
        <div
          className="fixed right-6 bottom-6 z-50"
          onMouseEnter={openTemporary}
          onMouseLeave={closeTemporary}
        >
          <button
            onClick={() => setOpen((v) => !v)}
            className="h-12 w-12 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center shadow-lg border border-[var(--border)]"
            aria-label="Open AI Chat"
          >
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2a10 10 0 100 20 10 10 0 000-20z"
                stroke="currentColor"
                strokeWidth="0"
              />
              <circle cx="12" cy="12" r="3" fill="white" />
            </svg>
          </button>
          <div className="flex gap-2 mt-2 justify-center">
            <button
              onClick={togglePin}
              className={`text-xs px-2 py-1 rounded ${pinned ? "bg-[var(--gbtn-hover-bg)]" : "bg-[var(--surface)]"} border border-[var(--border)]`}
            >
              {pinned ? "固定中" : "ピン"}
            </button>
          </div>
        </div>

        {open && (
          <div
            className="fixed right-6 bottom-20 z-50 w-[360px] max-h-[70vh] overflow-auto shadow-xl rounded-lg"
            ref={scrollContainerRef}
            onMouseEnter={openTemporary}
            onMouseLeave={closeTemporary}
          >
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-bold">AIチャット</div>
                <div className="text-xs text-[var(--muted)]">
                  ホバーポップオーバー
                </div>
              </div>

              <div
                className="space-y-2 max-h-[50vh] overflow-y-auto mb-2"
                ref={popoverMessagesRef}
              >
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`text-md p-2 rounded ${m.role === "user" ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--gbtn-hover-bg)] text-[var(--brand-700)]"}`}
                  >
                    <span className="font-bold mr-1">
                      {m.role === "user" ? "あなた" : "AI"}
                    </span>
                    {m.role === "assistant" && m.thought && (
                      <>
                        <span className="ml-2 text-[10px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis align-middle max-w-[55%] inline-block">
                          {toOneLine(m.thought)}
                        </span>
                        <button
                          className="ml-1 text-[10px] text-[var(--brand-600)] underline-offset-2 hover:underline"
                          onClick={() =>
                            setExpandedThoughtIndex(
                              expandedThoughtIndex === idx ? null : idx,
                            )
                          }
                        >
                          {expandedThoughtIndex === idx ? "折りたたむ" : "詳細"}
                        </button>
                      </>
                    )}
                    {m.role === "assistant" &&
                      expandedThoughtIndex === idx &&
                      m.thought && (
                        <div className="mt-1 text-xs text-[var(--muted)] whitespace-pre-wrap">
                          {m.thought}
                        </div>
                      )}
                    <div className="mt-1 ai-reply-content">
                      <ReactMarkdown
                        components={{
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          p: ({ node, ...props }) => (
                            <p
                              className="whitespace-pre-wrap text-sm"
                              {...props}
                            />
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
                        <span className="text-xs text-[var(--foreground)]">
                          {task}
                        </span>
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
                <div ref={bottomRef} data-role="chat-bottom-sentinel" />
              </div>

              <div className="flex flex-col gap-2">
                {showInitialButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
                    onClick={() =>
                      setInput("この人に適した制度を提案してください")
                    }
                    disabled={loading || !clientName}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    AIに最適な制度を提案してもらう
                  </Button>
                )}
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
            </div>
          </div>
        )}
      </div>
    );
  }

  // embedded mode: original card layout (unchanged)
  return (
    <div
      className={
        embedded
          ? "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mt-0 max-h-[420px] overflow-y-auto"
          : "bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 mt-4"
      }
      ref={scrollContainerRef}
    >
      <div className="space-y-2 mb-2">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`text-md p-2 rounded ${m.role === "user" ? "bg-[var(--surface)] text-[var(--foreground)]" : "bg-[var(--gbtn-hover-bg)] text-[var(--brand-700)]"}`}
          >
            <span className="font-bold mr-1">
              {m.role === "user" ? "あなた" : "AI"}
            </span>
            {m.role === "assistant" && m.thought && (
              <>
                <span className="ml-2 text-[10px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis align-middle max-w-[55%] inline-block">
                  {toOneLine(m.thought).slice(-55)}
                </span>
                <button
                  className="ml-1 text-[10px] text-[var(--brand-600)] underline-offset-2 hover:underline"
                  onClick={() =>
                    setExpandedThoughtIndex(
                      expandedThoughtIndex === idx ? null : idx,
                    )
                  }
                >
                  {expandedThoughtIndex === idx ? "折りたたむ" : "詳細"}
                </button>
              </>
            )}
            {m.role === "assistant" &&
              expandedThoughtIndex === idx &&
              m.thought && (
                <div className="mt-1 text-xs text-[var(--muted)] whitespace-pre-wrap">
                  {m.thought}
                </div>
              )}
            <div className="mt-1 ai-reply-content">
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
        <div ref={bottomRef} data-role="chat-bottom-sentinel" />
      </div>
      <div className="flex flex-col gap-2">
        {showInitialButton && (
          <Button
            variant="outline"
            size="sm"
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600"
            onClick={() => setInput("この人に適した制度を提案してください")}
            disabled={loading || !clientName}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AIに最適な制度を提案してもらう
          </Button>
        )}
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
    </div>
  );
};

export default SupportAgentChatUI;
