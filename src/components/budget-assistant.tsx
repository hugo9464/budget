"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { Icon } from "./icon";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; actions?: string[] };

const suggestions = [
  "Combien ai-je dépensé ce mois-ci ?",
  "Quelles sont mes 5 plus grosses dépenses ce mois-ci ?",
  "Répartis mes dépenses du mois par catégorie",
  "Aide-moi à classer une opération Carrefour",
  "Crée une catégorie pour mes dépenses d'animaux",
];

export function BudgetAssistant({ configured, model }: { configured: boolean; model: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome", role: "assistant",
    content: "Bonjour ! Je peux analyser vos dépenses, créer une catégorie, retrouver une opération et modifier son classement. Que voulez-vous savoir ?",
  }]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || pending || !configured) return;
    const history = messages.filter((message) => message.id !== "welcome").slice(-10);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setValue("");
    setPending(true);
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: history.map(({ role, content: text }) => ({ role, content: text })) }),
      });
      const result = await response.json() as {
        message?: string;
        error?: string;
        actions?: Array<
          | { type: "transaction_categorized"; label: string; category: string }
          | { type: "category_created"; name: string; kind: "expense" | "income" }
        >;
      };
      if (!response.ok) throw new Error(result.error || "L'assistant est indisponible.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant", content: result.message || "Réponse vide.",
        actions: result.actions?.map((action) => action.type === "category_created"
          ? `Catégorie créée : ${action.name} (${action.kind === "income" ? "revenu" : "dépense"})`
          : `${action.label} → ${action.category}`),
      }]);
      if (result.actions?.length) router.refresh();
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant",
        content: error instanceof Error ? error.message : "Une erreur est survenue.",
      }]);
    } finally {
      setPending(false);
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(value);
  }

  return <section className="assistant-card card" aria-label="Conversation avec l’assistant budget">
    <div className="assistant-toolbar">
      <span className="assistant-avatar"><Icon name="sparkles"/></span>
      <div><strong>Assistant budget</strong><small>{configured ? `${model} · Données en direct` : "Configuration requise"}</small></div>
      <span className={configured ? "assistant-status online" : "assistant-status"}>{configured ? "En ligne" : "Hors ligne"}</span>
    </div>
    <div className="assistant-conversation" aria-live="polite">
      {messages.map((message) => <div key={message.id} className={`assistant-message ${message.role}`}>
        <div>{message.content}</div>
        {message.actions?.map((action) => <span className="assistant-action" key={action}><Icon name="sparkles"/>{action}</span>)}
      </div>)}
      {messages.length === 1 ? <div className="assistant-suggestions">
        {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={!configured}>{suggestion}</button>)}
      </div> : null}
      {pending ? <div className="assistant-message assistant thinking"><span/><span/><span/><em className="sr-only">L’assistant réfléchit</em></div> : null}
      <div ref={endRef}/>
    </div>
    {!configured ? <div className="assistant-warning">Ajoutez <code>OPENAI_API_KEY</code> aux variables serveur pour activer le chat.</div> : null}
    <form className="assistant-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="assistant-message">Votre question</label>
      <textarea id="assistant-message" value={value} onChange={(event) => setValue(event.target.value)} maxLength={1500} rows={1} disabled={pending || !configured} placeholder="Posez une question sur vos opérations…" onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
      }}/>
      <button className="assistant-send" type="submit" disabled={pending || !configured || !value.trim()} aria-label="Envoyer"><Icon name="arrow-up"/></button>
    </form>
    <p className="assistant-privacy"><Icon name="lock"/> Le chat n’est pas enregistré. Les actions sont limitées à la gestion des catégories.</p>
  </section>;
}
