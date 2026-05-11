"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "ai";
  text: string;
  ts: Date;
};

/* ── Formats time safely on client only ───────────────────────── */
const useFormattedTime = (date: Date) => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, [date]);
  return label;
};

/* ── Typing Indicator ─────────────────────────────────────────── */
const TypingIndicator = () => (
  <div className="flex items-end gap-3 mb-6">
    <Avatar role="ai" />
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "14px 20px",
        borderRadius: "16px 16px 16px 4px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#22d3ee",
            display: "inline-block",
            animation: "dotBounce 0.85s infinite",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  </div>
);

/* ── Avatar ───────────────────────────────────────────────────── */
const Avatar = ({ role }: { role: "user" | "ai" }) => (
  <div
    style={{
      width: 32,
      height: 32,
      borderRadius: "50%",
      background:
        role === "ai"
          ? "linear-gradient(135deg,#22d3ee,#7c3aed)"
          : "linear-gradient(135deg,#818cf8,#ec4899)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      fontSize: 11,
      fontWeight: 700,
      color: "#fff",
      boxShadow:
        role === "ai"
          ? "0 4px 14px rgba(34,211,238,0.25)"
          : "0 4px 14px rgba(236,72,153,0.22)",
    }}
  >
    {role === "ai" ? "AI" : "U"}
  </div>
);

/* ── Single bubble ────────────────────────────────────────────── */
const ChatBubble = ({ msg }: { msg: Message }) => {
  const isUser = msg.role === "user";
  const time = useFormattedTime(msg.ts);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        marginBottom: 20,
        flexDirection: isUser ? "row-reverse" : "row",
        animation: "fadeUp 0.22s ease both",
      }}
    >
      <Avatar role={msg.role} />

      <div
        style={{
          maxWidth: "70%",
          padding: "12px 16px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isUser
            ? "linear-gradient(135deg,rgba(99,102,241,0.35),rgba(236,72,153,0.22))"
            : "rgba(255,255,255,0.05)",
          border: isUser
            ? "1px solid rgba(99,102,241,0.28)"
            : "1px solid rgba(255,255,255,0.09)",
          backdropFilter: "blur(10px)",
          fontSize: 14,
          lineHeight: 1.6,
          color: isUser ? "#e2e8f0" : "#cbd5e1",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.text}
        {/* Only render timestamp after client hydration (time === "" initially) */}
        {time && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: isUser ? "rgba(165,180,252,0.5)" : "rgba(148,163,184,0.4)",
              textAlign: isUser ? "right" : "left",
            }}
          >
            {time}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Page ─────────────────────────────────────────────────────── */
export default function ChatPage() {
  // Use a function initializer so Date() runs only on the client
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: "0", role: "ai", text: "Hello! I'm your AI assistant.", ts: new Date() },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "ai", text: data.response, ts: new Date() },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "ai", text: "Error connecting to backend.", ts: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'DM Sans', sans-serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes dotBounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-5px); }
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 99px; }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          fontFamily: "'DM Sans', sans-serif",
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, #1a1040 0%, #090914 55%, #04040a 100%)",
          position: "relative",
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            opacity: 0.035,
            backgroundImage:
              "linear-gradient(#7c5cfc 1px,transparent 1px),linear-gradient(90deg,#7c5cfc 1px,transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* ── Header ── */}
        <header
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",   /* centred */
            padding: "14px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
            background: "rgba(0,0,0,0.22)",
          }}
        >
          {/* inner wrapper same max-width as chat column */}
          <div style={{ width: "100%", maxWidth: 680, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "linear-gradient(135deg,#22d3ee,#7c3aed)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#34d399",
                    border: "2px solid #090914",
                    boxShadow: "0 0 6px #34d399",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.01em" }}>ASK ANY SITE</div>
                <div style={{ fontSize: 11, color: "#34d399", opacity: 0.85 }}>Online · Ready</div>
              </div>
            </div>

            <div
              style={{
                padding: "4px 12px",
                borderRadius: 99,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 11,
                color: "#64748b",
              }}
            >
              {messages.length - 1} msg{messages.length !== 2 ? "s" : ""}
            </div>
          </div>
        </header>

        {/* ── Messages ── */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 16px",
            position: "relative",
            zIndex: 10,
            /* centre the scroll container's content */
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* fixed-width column so every bubble is in one centred lane */}
          <div style={{ width: "100%", maxWidth: 680 }}>
            {messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </main>

        {/* ── Input ── */}
        <footer
          style={{
            position: "relative",
            zIndex: 10,
            padding: "12px 16px 18px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            background: "rgba(0,0,0,0.20)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",    /* centre the input bar */
          }}
        >
          <div style={{ width: "100%", maxWidth: 680 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
                transition: "border-color 0.2s",
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={loading}
                placeholder="Ask anything…"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "#e2e8f0",
                  fontFamily: "inherit",
                  opacity: loading ? 0.5 : 1,
                }}
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "none",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background:
                    input.trim() && !loading
                      ? "linear-gradient(135deg,#22d3ee,#7c3aed)"
                      : "rgba(255,255,255,0.07)",
                  opacity: input.trim() && !loading ? 1 : 0.3,
                  boxShadow:
                    input.trim() && !loading
                      ? "0 4px 16px rgba(34,211,238,0.28)"
                      : "none",
                  transition: "all 0.18s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(148,163,184,0.3)", marginTop: 8 }}>
              Press{" "}
              <kbd style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
                Enter
              </kbd>{" "}
              to send
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}