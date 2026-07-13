"use server";

import { revalidatePath } from "next/cache";
import { normalizeMerchant } from "@/lib/budget";
import { isDemoMode } from "@/lib/env";
import { hasValidSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function authorize(): Promise<void> {
  if (!(await hasValidSession())) throw new Error("Session expirée");
}

export async function updateTransactionCategory(transactionId: string, categoryId: string): Promise<void> {
  await authorize();
  if (isDemoMode()) return;
  const supabase = getSupabaseAdmin();
  const { data: transaction, error } = await supabase
    .from("transactions")
    .select("id,normalized_merchant")
    .eq("id", transactionId)
    .single();
  if (error) throw error;
  const merchant = normalizeMerchant(transaction.normalized_merchant);
  const { error: updateError } = await supabase.from("transactions").update({
    category_id: categoryId,
    category_source: "manual",
    category_confidence: 1,
    manually_categorized: true,
    updated_at: new Date().toISOString(),
  }).eq("id", transactionId);
  if (updateError) throw updateError;
  if (merchant) {
    await Promise.all([
      supabase.from("categorization_rules").upsert({
        matcher: merchant,
        match_type: "merchant",
        category_id: categoryId,
        priority: 1000,
        created_from_transaction: transactionId,
      }, { onConflict: "matcher,match_type" }),
      supabase.from("transactions").update({
        category_id: categoryId,
        category_source: "rule",
        category_confidence: 1,
      }).eq("normalized_merchant", merchant).eq("manually_categorized", false),
    ]);
  }
  revalidatePath("/");
  revalidatePath("/transactions");
}

export async function saveBudget(formData: FormData): Promise<void> {
  await authorize();
  if (isDemoMode()) return;
  const categoryId = String(formData.get("categoryId") ?? "");
  const month = String(formData.get("month") ?? "");
  const amount = Number(formData.get("amount"));
  if (!categoryId || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || amount < 0) throw new Error("Budget invalide");
  const { error } = await getSupabaseAdmin().from("monthly_budgets").upsert({
    category_id: categoryId,
    month: `${month}-01`,
    amount,
    updated_at: new Date().toISOString(),
  }, { onConflict: "category_id,month" });
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/budgets");
}

export async function saveCategory(formData: FormData): Promise<void> {
  await authorize();
  if (isDemoMode()) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const color = String(formData.get("color") ?? "#7357FF");
  const icon = String(formData.get("icon") ?? "dots").slice(0, 24);
  if (!name || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Catégorie invalide");
  const supabase = getSupabaseAdmin();
  if (id) {
    const { error } = await supabase.from("categories").update({ name, color, icon }).eq("id", id);
    if (error) throw error;
  } else {
    const slug = normalizeMerchant(name).replace(/\s+/g, "-") || crypto.randomUUID();
    const { error } = await supabase.from("categories").insert({ slug, name, color, icon, kind: "expense", sort_order: 1000 });
    if (error) throw error;
  }
  revalidatePath("/categories");
  revalidatePath("/budgets");
}
