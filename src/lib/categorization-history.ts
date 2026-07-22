import "server-only";

import type { HistoricalCategorizationExample } from "./categorization";
import { getSupabaseAdmin } from "./supabase/admin";
import type { CategorySource } from "./types";

interface StoredHistoryRow {
  description: string;
  normalized_merchant: string;
  amount: number | string;
  category_id: string | null;
  category_source: CategorySource;
  category_confidence: number | string | null;
  manually_categorized: boolean;
}

export async function getCategorizationHistory(limit = 2000): Promise<HistoricalCategorizationExample[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("description,normalized_merchant,amount,category_id,category_source,category_confidence,manually_categorized")
    .eq("status", "booked")
    .eq("is_transfer", false)
    .not("category_id", "is", null)
    .neq("category_source", "unclassified")
    .order("booked_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as StoredHistoryRow[]).flatMap((row) => {
    if (!row.category_id) return [];
    const confidence = row.category_confidence === null ? null : Number(row.category_confidence);
    const isReliable = row.manually_categorized
      || row.category_source === "manual"
      || row.category_source === "rule"
      || row.category_source === "heuristic"
      || (row.category_source === "ai" && (confidence ?? 0) >= 0.85);
    if (!isReliable) return [];
    return [{
      description: row.normalized_merchant || row.description,
      amount: Number(row.amount),
      categoryId: row.category_id,
      source: row.category_source,
      confidence,
      manuallyCategorized: row.manually_categorized,
    }];
  });
}
