import { useEffect, useRef, useState, type FormEvent } from "react";
import { HelpCircle, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

const QUICK_QUESTIONS = [
  { text: "Prenez-vous des médicaments anticoagulants ?", options: ["Oui", "Non", "Je ne sais pas"] },
  { text: "Êtes-vous seul(e) en ce moment ?", options: ["Oui", "Non"] },
  { text: "Avez-vous des allergies connues ?", options: ["Oui", "Non", "Je ne sais pas"] },
];

export function ChatPanel({ referralId, messages, disabled, onSent }: { referralId: string; messages: ChatMessage[]; disabled?: boolean; onSent: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"TEXT" | "INSTRUCTION">("TEXT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);

  async function send(body: { text: string; kind: "TEXT" | "QUESTION" | "INSTRUCTION"; options?: string[] }) {
    setBusy(true);
    setError(null);
    try {
      await api.chat(referralId, body.text, body.kind, body.options);
      setText("");
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) send({ text: text.trim(), kind });
  }

  const questions = Object.fromEntries(messages.filter((m) => m.kind === "QUESTION").map((m) => [m.id, m.text]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender === "STAFF" ? "justify-end" : m.sender === "SYSTEM" ? "justify-center" : "justify-start")}>
            {m.sender === "SYSTEM" ? (
              <span className={cn("rounded-full px-3 py-1 text-xs", m.kind === "RED_FLAG" ? "bg-red-100 font-medium text-red-800" : "bg-secondary text-muted-foreground")}>
                {m.text} · {time(m.createdAt)}
              </span>
            ) : (
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                m.sender === "STAFF" ? "bg-primary text-primary-foreground" : "border bg-card",
                m.kind === "WORSE" && "border-red-300 bg-red-50 text-red-900",
                m.kind === "INSTRUCTION" && "bg-amber-600 text-white")}>
                {m.kind === "ANSWER" && m.replyTo && <p className="mb-1 text-xs opacity-70">↳ {questions[m.replyTo] ?? "Réponse"}</p>}
                {m.kind === "WORSE" && <p className="mb-1 flex items-center gap-1 text-xs font-semibold"><TriangleAlert className="h-3.5 w-3.5" /> Le patient signale une aggravation</p>}
                <p dir="auto" className="whitespace-pre-wrap">{m.text}</p>
                {m.options && m.options.length > 0 && <p className="mt-1 text-xs opacity-80">Choix : {m.options.join(" / ")}</p>}
                <p className="mt-1 text-[10px] opacity-60">{m.senderName ? `${m.senderName} · ` : ""}{time(m.createdAt)}</p>
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      {!disabled && (
        <div className="space-y-2 border-t p-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button key={q.text} disabled={busy} onClick={() => send({ text: q.text, kind: "QUESTION", options: q.options })}
                className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs hover:bg-secondary">
                <HelpCircle className="h-3 w-3" /> {q.text}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as "TEXT" | "INSTRUCTION")}
              className="rounded-md border bg-card px-2 text-sm" aria-label="Type de message">
              <option value="TEXT">Message</option>
              <option value="INSTRUCTION">Consigne</option>
            </select>
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire au patient…" dir="auto" />
            <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
          </form>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
