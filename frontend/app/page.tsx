"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  text: string;
  sources?: string[];
  chunks_used?: number;
}

interface ChatResponse {
  reply: string;
  sources: string[];
  site_title: string;
  chunks_used: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "http://127.0.0.1:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span style={styles.typingDots}>
      <span style={{ ...styles.dot, animationDelay: "0ms" }} />
      <span style={{ ...styles.dot, animationDelay: "160ms" }} />
      <span style={{ ...styles.dot, animationDelay: "320ms" }} />
    </span>
  );
}

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ ...styles.messageRow, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <div style={styles.avatar} aria-label="AI">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
      )}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 6, alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div style={isUser ? styles.userBubble : styles.aiBubble}>
          <p style={styles.bubbleText}>{msg.text}</p>
        </div>
        {msg.sources && msg.sources.length > 0 && (
          <div style={styles.sourcesContainer}>
            <span style={styles.sourcesLabel}>Sources</span>
            <div style={styles.sourcesList}>
              {msg.sources.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={styles.sourceChip}>
                  {getDomain(src)}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [url, setUrl] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [ingested, setIngested] = useState(false);
  const [siteTitle, setSiteTitle] = useState("");
  const [statusText, setStatusText] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmedUrl = url.trim();
    const trimmedInput = input.trim();

    // Validate URL
    if (!trimmedUrl) {
      setUrlError("Please enter a website URL first.");
      return;
    }
    if (!isValidUrl(trimmedUrl)) {
      setUrlError("Please enter a valid URL (e.g. https://example.com).");
      return;
    }
    if (!trimmedInput) return;

    setUrlError("");
    setLoading(true);
    setInput("");

    // Append user message
    setMessages((prev) => [...prev, { role: "user", text: trimmedInput }]);

    try {
      // Step 1: Ingest on first message
      if (!ingested) {
        setStatusText("Indexing website…");
        const ingestRes = await fetch(`${BASE_URL}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl }),
        });
        if (!ingestRes.ok) throw new Error(`Ingest failed: ${ingestRes.statusText}`);
        setIngested(true);
      }

      // Step 2: Chat
      setStatusText("Searching for answers…");
      const chatRes = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl, message: trimmedInput }),
      });
      if (!chatRes.ok) throw new Error(`Chat failed: ${chatRes.statusText}`);

      const data: ChatResponse = await chatRes.json();

      if (data.site_title) setSiteTitle(data.site_title);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          sources: data.sources,
          chunks_used: data.chunks_used,
        },
      ]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `⚠️ ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
      setStatusText("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) handleSend();
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value !== url) {
      // Reset session when URL changes
      setIngested(false);
      setSiteTitle("");
      if (messages.length > 0) setMessages([]);
    }
    if (urlError) setUrlError("");
  };

  const isEmpty = messages.length === 0 && !loading;

  return (
    <>
      <style>{cssAnimations}</style>
      <div style={styles.root}>
        {/* ── Header ── */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.logo}>
              <div style={styles.logoIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h1 style={styles.logoTitle}>Ask Any Website</h1>
                <p style={styles.logoSub}>AI-powered site explorer</p>
              </div>
            </div>
            {siteTitle && (
              <div style={styles.siteBadge}>
                <span style={styles.siteBadgeDot} />
                {siteTitle}
              </div>
            )}
          </div>
        </header>

        {/* ── URL Bar ── */}
        <div style={styles.urlBar}>
          <div style={styles.urlBarInner}>
            <div style={styles.urlInputWrapper}>
              <svg style={styles.urlIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                style={{ ...styles.urlInput, ...(urlError ? styles.urlInputError : {}) }}
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                disabled={loading}
                aria-label="Website URL"
              />
              {url && (
                <button
                  style={styles.urlClear}
                  onClick={() => handleUrlChange("")}
                  aria-label="Clear URL"
                  tabIndex={-1}
                >
                  ✕
                </button>
              )}
            </div>
            {urlError && <p style={styles.urlErrorText}>{urlError}</p>}
          </div>
        </div>

        {/* ── Chat Area ── */}
        <main style={styles.chatArea}>
          {isEmpty ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h2 style={styles.emptyTitle}>Start exploring any website</h2>
              <p style={styles.emptyDesc}>
                Paste a URL above, then ask anything about the site — pricing, features, policies, and more.
              </p>
              <div style={styles.emptyChips}>
                {["What is this site about?", "What are the main features?", "What does it cost?"].map((q) => (
                  <button
                    key={q}
                    style={styles.chip}
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={styles.messageList}>
              {messages.map((msg, i) => (
                <ChatBubble key={i} msg={msg} />
              ))}
              {loading && (
                <div style={{ ...styles.messageRow, justifyContent: "flex-start" }}>
                  <div style={styles.avatar}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div style={styles.aiBubble}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <TypingDots />
                      {statusText && <span style={styles.statusText}>{statusText}</span>}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </main>

        {/* ── Input Bar ── */}
        <footer style={styles.inputBar}>
          <div style={styles.inputBarInner}>
            <input
              ref={inputRef}
              style={styles.messageInput}
              type="text"
              placeholder={url ? "Ask anything about this site…" : "Enter a URL above to start"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || !url}
              aria-label="Message input"
            />
            <button
              style={{
                ...styles.sendButton,
                ...(loading || !input.trim() || !url ? styles.sendButtonDisabled : {}),
              }}
              onClick={handleSend}
              disabled={loading || !input.trim() || !url}
              aria-label="Send message"
            >
              {loading ? (
                <span style={styles.spinner} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
          <p style={styles.hint}>Press Enter to send</p>
        </footer>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cssAnimations = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0d0f14;
    font-family: 'Instrument Sans', sans-serif;
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40% { transform: translateY(-6px); opacity: 1; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    maxWidth: 780,
    margin: "0 auto",
    background: "#0d0f14",
    color: "#e8eaf0",
    fontFamily: "'Instrument Sans', sans-serif",
    position: "relative",
  },

  // Header
  header: {
    borderBottom: "1px solid #1e2130",
    padding: "14px 20px",
    background: "#0d0f14",
    flexShrink: 0,
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "linear-gradient(135deg, #5b6af0 0%, #9b59f5 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#e8eaf0",
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  logoSub: {
    fontSize: 11,
    color: "#5a5f78",
    letterSpacing: "0.02em",
    marginTop: 1,
  },
  siteBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#8b90a8",
    background: "#161826",
    border: "1px solid #1e2130",
    borderRadius: 20,
    padding: "4px 12px",
    fontFamily: "'DM Mono', monospace",
  },
  siteBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4ade80",
    flexShrink: 0,
    boxShadow: "0 0 6px #4ade80",
  },

  // URL Bar
  urlBar: {
    padding: "12px 20px",
    borderBottom: "1px solid #1e2130",
    background: "#0d0f14",
    flexShrink: 0,
  },
  urlBarInner: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  urlInputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  urlIcon: {
    position: "absolute",
    left: 12,
    color: "#5a5f78",
    pointerEvents: "none",
    flexShrink: 0,
  },
  urlInput: {
    width: "100%",
    padding: "9px 36px 9px 38px",
    background: "#161826",
    border: "1px solid #1e2130",
    borderRadius: 10,
    color: "#e8eaf0",
    fontSize: 13,
    fontFamily: "'DM Mono', monospace",
    outline: "none",
    transition: "border-color 0.15s",
  },
  urlInputError: {
    borderColor: "#f87171",
  },
  urlClear: {
    position: "absolute",
    right: 10,
    background: "none",
    border: "none",
    color: "#5a5f78",
    cursor: "pointer",
    fontSize: 12,
    padding: 4,
    lineHeight: 1,
  },
  urlErrorText: {
    fontSize: 12,
    color: "#f87171",
    paddingLeft: 4,
  },

  // Chat
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
  },
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    animation: "fadeSlideIn 0.22s ease both",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #5b6af0, #9b59f5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "#fff",
  },
  userBubble: {
    background: "linear-gradient(135deg, #5b6af0 0%, #7c5af5 100%)",
    borderRadius: "18px 18px 4px 18px",
    padding: "11px 16px",
  },
  aiBubble: {
    background: "#161826",
    border: "1px solid #1e2130",
    borderRadius: "18px 18px 18px 4px",
    padding: "11px 16px",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "#e8eaf0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },

  // Sources
  sourcesContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    paddingLeft: 4,
  },
  sourcesLabel: {
    fontSize: 10,
    color: "#5a5f78",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 600,
  },
  sourcesList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  sourceChip: {
    fontSize: 11,
    color: "#8b90f0",
    background: "#161826",
    border: "1px solid #2a2d45",
    borderRadius: 6,
    padding: "3px 8px",
    textDecoration: "none",
    fontFamily: "'DM Mono', monospace",
    transition: "border-color 0.15s, color 0.15s",
  },

  // Typing
  typingDots: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#5b6af0",
    display: "inline-block",
    animation: "bounce 1.2s ease-in-out infinite",
  },
  statusText: {
    fontSize: 12,
    color: "#5a5f78",
    fontStyle: "italic",
  },

  // Empty state
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    gap: 16,
    padding: "40px 20px",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    background: "#161826",
    border: "1px solid #1e2130",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5b6af0",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: "#e8eaf0",
    letterSpacing: "-0.02em",
  },
  emptyDesc: {
    fontSize: 14,
    color: "#5a5f78",
    maxWidth: 360,
    lineHeight: 1.6,
  },
  emptyChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    background: "#161826",
    border: "1px solid #1e2130",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 13,
    color: "#8b90a8",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },

  // Input bar
  inputBar: {
    padding: "12px 20px 16px",
    borderTop: "1px solid #1e2130",
    background: "#0d0f14",
    flexShrink: 0,
  },
  inputBarInner: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    padding: "11px 16px",
    background: "#161826",
    border: "1px solid #1e2130",
    borderRadius: 12,
    color: "#e8eaf0",
    fontSize: 14,
    fontFamily: "'Instrument Sans', sans-serif",
    outline: "none",
    transition: "border-color 0.15s",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #5b6af0, #9b59f5)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    flexShrink: 0,
    transition: "opacity 0.15s, transform 0.1s",
  },
  sendButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  spinner: {
    width: 16,
    height: 16,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.7s linear infinite",
  },
  hint: {
    fontSize: 11,
    color: "#3a3f55",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: "0.02em",
  },
};