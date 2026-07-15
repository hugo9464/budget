import "server-only";
import { addDays } from "./time";
import { categorizeLocally, categorizeWithAi, type CategorizationRule } from "./categorization";
import {
  detectTransfers,
  normalizeMerchant,
  pendingMatchFingerprint,
  transactionDescription,
  transactionFingerprint,
} from "./budget";
import { isDemoMode, requireEnv } from "./env";
import { createBankCallbackToken } from "./session";
import { getSupabaseAdmin } from "./supabase/admin";
import type { BankAccount, BudgetTransaction, Category, GoCardlessTransaction } from "./types";

const API_URL = "https://bankaccountdata.gocardless.com/api/v2";

interface Institution {
  id: string;
  name: string;
  bic: string;
  transaction_total_days: string;
  max_access_valid_for_days: string;
  logo: string;
}

interface Requisition {
  id: string;
  status: string;
  link: string;
  accounts: string[];
  agreement: string;
}

export class GoCardlessError extends Error {
  constructor(public code: string, message: string, public status = 500) {
    super(message);
  }
}

function friendlyError(status: number, body: unknown): GoCardlessError {
  const text = typeof body === "object" && body && "summary" in body ? String(body.summary) : "Erreur GoCardless";
  if (status === 401) return new GoCardlessError("ACCESS_EXPIRED", "La connexion bancaire a expiré. Reconnectez BoursoBank.", 401);
  if (status === 409) return new GoCardlessError("ACCOUNT_PROCESSING", "Le compte est encore en cours de préparation.", 409);
  if (status === 429) return new GoCardlessError("RATE_LIMIT", "La banque limite temporairement les actualisations.", 429);
  if (status === 503) return new GoCardlessError("BANK_UNAVAILABLE", "BoursoBank est temporairement indisponible.", 503);
  return new GoCardlessError("GOCARDLESS_ERROR", text, status);
}

async function token(): Promise<string> {
  const response = await fetch(`${API_URL}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret_id: requireEnv("GOCARDLESS_SECRET_ID"), secret_key: requireEnv("GOCARDLESS_SECRET_KEY") }),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw friendlyError(response.status, body);
  return body.access as string;
}

async function gcFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await token();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw friendlyError(response.status, body);
  return body as T;
}

export async function findBoursoInstitution(): Promise<Institution> {
  if (process.env.GOCARDLESS_SANDBOX === "true") {
    return {
      id: "SANDBOXFINANCE_SFIN0000",
      name: "Sandbox Finance",
      bic: "SFIN0000",
      transaction_total_days: "730",
      max_access_valid_for_days: "90",
      logo: "",
    };
  }
  const institutions = await gcFetch<Institution[]>("/institutions/?country=fr");
  const institution = institutions.find((item) => /bourso|boursorama/i.test(`${item.id} ${item.name}`));
  if (!institution) throw new GoCardlessError("INSTITUTION_NOT_FOUND", "BoursoBank n’est pas disponible dans GoCardless actuellement.", 404);
  return institution;
}

export async function createBankConnection(appUrl: string): Promise<string> {
  if (isDemoMode()) return `${appUrl}/settings?connected=demo`;
  const institution = await findBoursoInstitution();
  const supabase = getSupabaseAdmin();
  const { data: connection, error } = await supabase
    .from("bank_connections")
    .insert({ institution_id: institution.id, institution_name: institution.name, status: "created" })
    .select("id")
    .single();
  if (error) throw error;

  const accessDays = Math.min(Number(institution.max_access_valid_for_days || 90), 90);
  const historyDays = Math.min(Number(institution.transaction_total_days || 730), 730);
  const callbackUrl = new URL("/api/gocardless/callback", appUrl);
  callbackUrl.searchParams.set("connection", connection.id);
  callbackUrl.searchParams.set("token", await createBankCallbackToken(connection.id));
  const agreement = await gcFetch<{ id: string }>("/agreements/enduser/", {
    method: "POST",
    body: JSON.stringify({
      institution_id: institution.id,
      max_historical_days: historyDays,
      access_valid_for_days: accessDays,
      access_scope: ["balances", "details", "transactions"],
    }),
  });
  const requisition = await gcFetch<Requisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: callbackUrl.toString(),
      institution_id: institution.id,
      reference: connection.id,
      agreement: agreement.id,
      user_language: "FR",
      account_selection: true,
    }),
  });
  await supabase.from("bank_connections").update({
    requisition_id: requisition.id,
    agreement_id: agreement.id,
    consent_expires_at: addDays(new Date(), accessDays).toISOString(),
  }).eq("id", connection.id);
  return requisition.link;
}

export async function completeBankConnection(connectionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: connection, error } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .single();
  if (error || !connection?.requisition_id) throw error ?? new Error("Connexion bancaire introuvable");
  const requisition = await gcFetch<Requisition>(`/requisitions/${connection.requisition_id}/`);
  if (requisition.status !== "LN") {
    const mapped = requisition.status === "RJ" ? "rejected" : requisition.status === "EX" ? "expired" : "error";
    await supabase.from("bank_connections").update({ status: mapped, error_message: `Statut GoCardless : ${requisition.status}` }).eq("id", connectionId);
    throw new GoCardlessError("CONSENT_NOT_LINKED", "L’autorisation bancaire n’a pas été finalisée.", 400);
  }
  await Promise.all(requisition.accounts.map(async (externalId) => {
    const [details, balances] = await Promise.all([
      gcFetch<{ account: { iban?: string; name?: string; product?: string; currency?: string } }>(`/accounts/${externalId}/details/`),
      gcFetch<{ balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }>(`/accounts/${externalId}/balances/`),
    ]);
    const current = balances.balances.find((item) => /interim|closing|expected/i.test(item.balanceType)) ?? balances.balances[0];
    const available = balances.balances.find((item) => /available/i.test(item.balanceType));
    const iban = details.account.iban;
    await supabase.from("bank_accounts").upsert({
      connection_id: connectionId,
      external_id: externalId,
      iban_masked: iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : null,
      name: details.account.name || details.account.product || "Compte BoursoBank",
      currency: details.account.currency || current?.balanceAmount.currency || "EUR",
      balance: Number(current?.balanceAmount.amount ?? 0),
      available_balance: available ? Number(available.balanceAmount.amount) : null,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "external_id" });
  }));
  await supabase.from("bank_connections").update({ status: "linked", error_message: null, updated_at: new Date().toISOString() }).eq("id", connectionId);
  await syncBankData("callback", true);
}

async function importTransactions(account: BankAccount, rows: GoCardlessTransaction[], status: "booked" | "pending"): Promise<number> {
  const supabase = getSupabaseAdmin();
  const [categoriesResult, rulesResult] = await Promise.all([
    supabase.from("categories").select("*"),
    supabase.from("categorization_rules").select("*").order("priority", { ascending: false }),
  ]);
  if (categoriesResult.error || rulesResult.error) throw categoriesResult.error ?? rulesResult.error;
  const categories = categoriesResult.data as Category[];
  const rules = rulesResult.data as CategorizationRule[];
  const unclassified = categories.find((item) => item.slug === "a-classer")!;

  const prepared = rows.map((row) => {
    const description = transactionDescription(row) || "Opération sans libellé";
    const amount = Number(row.transactionAmount.amount);
    return {
      row,
      amount,
      description,
      decision: categorizeLocally(description, amount, categories, rules),
    };
  });
  const unknown = prepared.filter((item) => !item.decision).slice(0, 50);
  let ai = new Map<number, Awaited<ReturnType<typeof categorizeWithAi>> extends Map<number, infer D> ? D : never>();
  try {
    ai = await categorizeWithAi(unknown.map((item) => ({ description: item.description, amount: item.amount })), categories);
  } catch (error) {
    console.error("Catégorisation OpenAI indisponible", error);
  }
  const unknownIndex = new Map(unknown.map((item, index) => [item, index]));

  const records = prepared.map((item) => {
    const aiDecision = unknownIndex.has(item) ? ai.get(unknownIndex.get(item)!) : undefined;
    const decision = item.decision ?? aiDecision ?? { categoryId: unclassified.id, source: "unclassified" as const, confidence: null };
    return {
      account_id: account.id,
      external_id: item.row.transactionId ?? item.row.internalTransactionId ?? null,
      fingerprint: transactionFingerprint(account.id, item.row, status),
      pending_fingerprint: pendingMatchFingerprint(account.id, item.row),
      status,
      booked_at: item.row.bookingDate ?? item.row.valueDate ?? null,
      value_at: item.row.valueDate ?? null,
      amount: item.amount,
      currency: item.row.transactionAmount.currency,
      counterparty: item.row.creditorName ?? item.row.debtorName ?? null,
      description: item.description,
      normalized_merchant: normalizeMerchant(item.description),
      category_id: decision.categoryId,
      category_source: decision.source,
      category_confidence: decision.confidence,
      updated_at: new Date().toISOString(),
    };
  });
  if (records.length === 0) return 0;
  if (status === "booked") {
    const matches = records.map((record) => record.pending_fingerprint);
    const { error: reconciliationError } = await supabase
      .from("transactions")
      .delete()
      .eq("status", "pending")
      .in("pending_fingerprint", matches);
    if (reconciliationError) throw reconciliationError;
  }
  const { error } = await supabase.from("transactions").upsert(records, { onConflict: "account_id,fingerprint", ignoreDuplicates: false });
  if (error) throw error;
  return records.length;
}

export async function syncBankData(trigger: "app_open" | "manual" | "callback", force = false): Promise<{ imported: number; skipped: boolean }> {
  if (isDemoMode()) return { imported: 0, skipped: true };
  const supabase = getSupabaseAdmin();
  const { data: connections, error: connectionsError } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("status", "linked")
    .order("created_at", { ascending: false });
  if (connectionsError) throw connectionsError;
  const eligibleConnections = (connections ?? []).filter((connection) =>
    force || !connection.last_synced_at || Date.now() - new Date(connection.last_synced_at).getTime() >= 15 * 60_000,
  );
  if (!eligibleConnections.length) return { imported: 0, skipped: true };

  const { data: running } = await supabase.from("sync_runs").select("id").eq("status", "running").maybeSingle();
  if (running) return { imported: 0, skipped: true };
  let imported = 0;
  let successfulConnections = 0;
  let firstError: GoCardlessError | null = null;

  for (const connection of eligibleConnections) {
    const { data: run, error: runError } = await supabase
      .from("sync_runs")
      .insert({ connection_id: connection.id, status: "running", trigger })
      .select("id")
      .single();
    if (runError) {
      firstError ??= new GoCardlessError("SYNC_ERROR", runError.message);
      continue;
    }

    try {
      const { data: accounts, error } = await supabase.from("bank_accounts").select("*").eq("connection_id", connection.id);
      if (error) throw error;
      let connectionImported = 0;
      for (const account of accounts as BankAccount[]) {
        const [transactionData, balances] = await Promise.all([
          gcFetch<{ transactions: { booked?: GoCardlessTransaction[]; pending?: GoCardlessTransaction[] } }>(`/accounts/${account.external_id}/transactions/`),
          gcFetch<{ balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }>(`/accounts/${account.external_id}/balances/`),
        ]);
        const current = balances.balances.find((item) => /interim|closing|expected/i.test(item.balanceType)) ?? balances.balances[0];
        const available = balances.balances.find((item) => /available/i.test(item.balanceType));
        // Les opérations en attente sont enregistrées d’abord ; la version
        // comptabilisée les réconcilie ensuite et reste la source de vérité.
        const pendingCount = await importTransactions(account, transactionData.transactions.pending ?? [], "pending");
        const bookedCount = await importTransactions(account, transactionData.transactions.booked ?? [], "booked");
        connectionImported += bookedCount + pendingCount;
        await supabase.from("bank_accounts").update({
          balance: Number(current?.balanceAmount.amount ?? account.balance),
          available_balance: available ? Number(available.balanceAmount.amount) : null,
          last_synced_at: new Date().toISOString(),
        }).eq("id", account.id);
      }

      const finished = new Date().toISOString();
      await Promise.all([
        supabase.from("bank_connections").update({ last_synced_at: finished, error_message: null }).eq("id", connection.id),
        supabase.from("sync_runs").update({ status: "success", imported_count: connectionImported, finished_at: finished }).eq("id", run.id),
      ]);
      imported += connectionImported;
      successfulConnections += 1;
    } catch (error) {
      const known = error instanceof GoCardlessError ? error : new GoCardlessError("SYNC_ERROR", error instanceof Error ? error.message : "Erreur de synchronisation");
      firstError ??= known;
      const finished = new Date().toISOString();
      await Promise.all([
        supabase.from("bank_connections").update({ status: known.code === "ACCESS_EXPIRED" ? "expired" : "linked", error_message: known.message }).eq("id", connection.id),
        supabase.from("sync_runs").update({ status: "error", error_code: known.code, error_message: known.message, finished_at: finished }).eq("id", run.id),
      ]);
    }
  }

  const { data: recent } = await supabase.from("transactions").select("*").gte("booked_at", addDays(new Date(), -7).toISOString().slice(0, 10));
  const transferIds = detectTransfers((recent ?? []).map((item) => ({ ...item, amount: Number(item.amount) })) as BudgetTransaction[]);
  if (transferIds.size) {
    const { data: transferCategory } = await supabase.from("categories").select("id").eq("slug", "transferts").single();
    await supabase.from("transactions").update({ is_transfer: true, category_id: transferCategory!.id, category_source: "heuristic" }).in("id", [...transferIds]);
  }
  if (!successfulConnections && firstError) throw firstError;
  return { imported, skipped: false };
}
