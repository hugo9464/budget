import type { Metadata } from "next";
import { BudgetAssistant } from "@/components/budget-assistant";
import { OPENAI_ASSISTANT_MODEL } from "@/lib/budget-assistant";

export const metadata: Metadata = { title: "Assistant budget" };

export default function AssistantPage() {
  return <div className="page assistant-page">
    <header className="page-header"><div><p className="eyebrow">ASSISTANT IA</p><h1>Parlez à votre budget</h1><p className="muted">Posez vos questions, créez une catégorie ou demandez de classer une opération.</p></div></header>
    <BudgetAssistant configured={Boolean(process.env.OPENAI_API_KEY)} model={OPENAI_ASSISTANT_MODEL}/>
  </div>;
}
