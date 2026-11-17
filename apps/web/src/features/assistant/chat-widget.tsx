import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Send, X } from "lucide-react";
import { formatINR, type ChatReply } from "@lofticore/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useTourRequests } from "@/features/tour/tour-controller";

interface Message {
  from: "user" | "bot";
  text: string;
  reply?: ChatReply;
}

const KEY = "lofticore-chat";
const STARTERS = ["Show me sofas", "How do I pay?", "Track my order", "Show me around"];
const WELCOME: Message = {
  from: "bot",
  text: "Hi, I'm Lofti! I can help you find furniture, check an order, or answer questions about delivery and payment.",
  reply: { reply: "", suggestions: STARTERS, source: "rules" },
};

const load = (): Message[] => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Message[] | null;
    return saved?.length ? saved : [WELCOME];
  } catch {
    return [WELCOME];
  }
};

// The floating help bubble. Answers come from the shop's built-in guide first, with an
// AI model behind it for anything unusual (when one is set up on the server).
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(load);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const startTour = useTourRequests((s) => s.start);

  const send = useMutation({
    mutationFn: (message: string) =>
      api<ChatReply>("/assistant/chat", {
        method: "POST",
        body: {
          message,
          history: messages.slice(-6).map((m) => ({
            role: m.from === "user" ? "user" : "assistant",
            text: (m.reply?.reply || m.text).slice(0, 1000),
          })),
        },
      }),
    meta: { silent: true },
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* private mode */
    }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || send.isPending) return;
    setText("");
    setMessages((m) => [...m, { from: "user", text: q }]);
    send.mutate(q, {
      onSuccess: (reply) => {
        setMessages((m) => [...m, { from: "bot", text: reply.reply, reply }]);
        if (reply.action === "start_tour") {
          setOpen(false);
          startTour();
        }
      },
      onError: () =>
        setMessages((m) => [
          ...m,
          { from: "bot", text: "Sorry, I can't answer right now. Please try again in a moment." },
        ]),
    });
  };

  const lastBot = [...messages].reverse().find((m) => m.from === "bot");

  return (
    <>
      <button
        data-tour="chat"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Chat with Lofti, our assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-brand text-white shadow-xl transition hover:scale-105 hover:bg-brand-dark"
      >
        {open ? (
          <X className="size-6" aria-hidden />
        ) : (
          <MessageCircle className="size-6" aria-hidden />
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Chat with Lofti"
          className="fixed inset-x-3 bottom-24 z-40 flex max-h-[min(34rem,calc(100vh-8rem))] flex-col overflow-hidden rounded-3xl border border-line bg-cream shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[24rem]"
        >
          <header className="flex items-center gap-3 bg-brand px-5 py-4 text-white">
            <span
              className="grid size-9 place-items-center rounded-full bg-gold font-display text-lg text-ink"
              aria-hidden
            >
              L
            </span>
            <div>
              <p className="font-semibold">Lofti</p>
              <p className="text-xs text-white/75">Shopping help, any time</p>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[88%] space-y-2.5 rounded-2xl px-4 py-2.5 text-sm",
                    m.from === "user" ? "bg-brand text-white" : "bg-white shadow-sm",
                  )}
                >
                  {(m.reply?.reply || m.text) && (
                    <p className="whitespace-pre-line">{m.reply?.reply || m.text}</p>
                  )}

                  {m.reply?.products && (
                    <ul className="space-y-2">
                      {m.reply.products.map((p) => (
                        <li key={p.id}>
                          <Link
                            to={`/product/${p.slug}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 rounded-xl border border-line p-2 hover:border-brand"
                          >
                            <img src={p.image} alt="" className="size-12 rounded-lg object-cover" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">{p.title}</span>
                              <span className="text-xs text-muted">{formatINR(p.price)}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  {m.reply?.links && (
                    <div className="flex flex-wrap gap-2">
                      {m.reply.links.map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          onClick={() => setOpen(false)}
                          className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/15"
                        >
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {send.isPending && (
              <div className="flex" role="status" aria-label="Lofti is typing">
                <span className="flex gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="size-1.5 animate-bounce rounded-full bg-muted"
                      style={{ animationDelay: `${d * 120}ms` }}
                    />
                  ))}
                </span>
              </div>
            )}
            <div ref={bottom} />
          </div>

          {lastBot?.reply?.suggestions && !send.isPending && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {lastBot.reply.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-brand/30 bg-white px-3 py-1.5 text-xs text-brand hover:bg-brand-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Ask about products, delivery…"
              aria-label="Your message"
              className="h-11 flex-1 rounded-full border border-line bg-cream px-4 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={!text.trim() || send.isPending}
              aria-label="Send"
              className="grid size-11 place-items-center rounded-full bg-brand text-white disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </form>
          <p className="bg-white px-4 pb-3 text-center text-[11px] text-muted">
            Never share your password, OTP or UPI PIN with anyone, including me.
          </p>
        </section>
      )}
    </>
  );
}
