import "server-only";

import { categorizeWithAi, OPENAI_CATEGORIZATION_MODEL, sanitizeTransactionLabelForAi } from "./categorization";
import { getCategorizationHistory } from "./categorization-history";
import { isDemoMode } from "./env";
import { getSupabaseAdmin } from "./supabase/admin";
import type { Category } from "./types";

const BATCH_SIZE = 50;

type StoredTransaction = Record<string, unknown> & {
  id: string;
  description: string;
  amount: number | string;
};

function pendingAiQuery() {
  return getSupabaseAdmin()
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "booked")
    .eq("category_source", "unclassified")
    .eq("manually_categorized", false)
    .is("category_confidence", null);
}

export async function getAiCategorizationStatus(): Promise<{ configured: boolean; model: string; pending: number }> {
  const configured = Boolean(process.env.OPENAI_API_KEY);
  const model = OPENAI_CATEGORIZATION_MODEL;
  if (isDemoMode()) return { configured, model, pending: 0 };
  const { count, error } = await pendingAiQuery();
  if (error) throw error;
  return { configured, model, pending: count ?? 0 };
}

export async function categorizeUnclassifiedTransactionsWithAi(limit = 250): Promise<{
  processed: number;
  classified: number;
  uncertain: number;
  remaining: number;
  model: string;
}> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY n’est pas configurée");
  if (isDemoMode()) return { processed: 0, classified: 0, uncertain: 0, remaining: 0, model: OPENAI_CATEGORIZATION_MODEL };

  const supabase = getSupabaseAdmin();
  const [{ data: categoryRows, error: categoryError }, { data: transactionRows, error: transactionError }, history] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase
      .from("transactions")
      .select("*")
      .eq("status", "booked")
      .eq("category_source", "unclassified")
      .eq("manually_categorized", false)
      .is("category_confidence", null)
      .order("booked_at", { ascending: false })
      .limit(limit),
    getCategorizationHistory(),
  ]);
  if (categoryError || transactionError) throw categoryError ?? transactionError;

  const categories = categoryRows as Category[];
  const transactions = (transactionRows ?? []) as StoredTransaction[];
  const grouped = new Map<string, { description: string; amount: number; transactions: StoredTransaction[] }>();
  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    const label = sanitizeTransactionLabelForAi(transaction.description) || "operation inconnue";
    const key = `${amount < 0 ? "depense" : "revenu"}:${label}`;
    const current = grouped.get(key);
    if (current) current.transactions.push(transaction);
    else grouped.set(key, { description: label, amount, transactions: [transaction] });
  }

  const uniqueInputs = [...grouped.values()];
  let processed = 0;
  let classified = 0;
  let uncertain = 0;
  for (let offset = 0; offset < uniqueInputs.length; offset += BATCH_SIZE) {
    const batch = uniqueInputs.slice(offset, offset + BATCH_SIZE);
    const decisions = await categorizeWithAi(
      batch.map((item) => ({ description: item.description, amount: item.amount })),
      categories,
      history,
    );
    const now = new Date().toISOString();
    const updates = batch.flatMap((item, index) => {
      const decision = decisions.get(index);
      if (!decision) return [];
      return item.transactions.map((transaction) => ({
        ...transaction,
        category_id: decision.categoryId,
        category_source: decision.source,
        category_confidence: decision.confidence,
        updated_at: now,
      }));
    });
    if (updates.length) {
      const { error } = await supabase.from("transactions").upsert(updates, { onConflict: "id" });
      if (error) throw error;
    }
    for (const [index, decision] of decisions) {
      const count = batch[index]?.transactions.length ?? 0;
      processed += count;
      if (decision.source === "ai") classified += count;
      else uncertain += count;
    }
  }

  const { count: remaining, error: remainingError } = await pendingAiQuery();
  if (remainingError) throw remainingError;
  return { processed, classified, uncertain, remaining: remaining ?? 0, model: OPENAI_CATEGORIZATION_MODEL };
}
