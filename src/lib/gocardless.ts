import "server-only";
import { addDays, currentParisYearRange } from "./time";
import {
  categorizeLocally,
  categorizeWithAi,
  findSimilarCategorizationExamples,
  type CategorizationRule,
  type CategoryDecision,
} from "./categorization";
import { getCategorizationHistory } from "./categorization-history";
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

type AccountResource = "balances" | "transactions";

export interface RateLimitInfo {
  remaining: number | null;
  resetAt: string | null;
}

export class GoCardlessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 500,
    public rateLimit: RateLimitInfo | null = null,
    public resource: AccountResource | null = null,
  ) {
    super(message);
  }
}

function resetFromSeconds(value: string | null, now: Date): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return new Date(now.getTime() + seconds * 1000).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function parseRateLimitHeaders(headers: Headers, now = new Date()): RateLimitInfo {
  const remainingValue = headers.get("x-ratelimit-account-success-remaining")
    ?? headers.get("http_x_ratelimit_account_success_remaining")
    ?? headers.get("x-ratelimit-remaining")
    ?? headers.get("http_x_ratelimit_remaining");
  const remainingNumber = remainingValue === null ? null : Number(remainingValue);
  const resetValue = headers.get("x-ratelimit-account-success-reset")
    ?? headers.get("http_x_ratelimit_account_success_reset")
    ?? headers.get("x-ratelimit-reset")
    ?? headers.get("http_x_ratelimit_reset");
  return {
    remaining: remainingNumber !== null && Number.isFinite(remainingNumber) ? Math.max(0, remainingNumber) : null,
    resetAt: resetFromSeconds(resetValue, now),
  };
}

function rateLimitFromError(body: unknown, headers: Headers, now = new Date()): RateLimitInfo {
  const fromHeaders = parseRateLimitHeaders(headers, now);
  if (fromHeaders.resetAt) return { remaining: 0, resetAt: fromHeaders.resetAt };
  const detail = typeof body === "object" && body && "detail" in body ? String(body.detail) : "";
  const seconds = detail.match(/(?:try again in|in)\s+(\d+)\s+seconds?/i)?.[1] ?? null;
  return { remaining: 0, resetAt: resetFromSeconds(seconds, now) ?? addDays(now, 1).toISOString() };
}

function friendlyError(status: number, body: unknown, headers = new Headers(), resource: AccountResource | null = null): GoCardlessError {
  const text = typeof body === "object" && body && "summary" in body ? String(body.summary) : "Erreur GoCardless";
  if (status === 401) return new GoCardlessError("ACCESS_EXPIRED", "La connexion bancaire a expiré. Reconnectez BoursoBank.", 401);
  if (status === 409) return new GoCardlessError("ACCOUNT_PROCESSING", "Le compte est encore en cours de préparation.", 409);
  if (status === 429) return new GoCardlessError("RATE_LIMIT", "Quota bancaire épuisé. Attendez son renouvellement avant de synchroniser.", 429, rateLimitFromError(body, headers), resource);
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
  if (!response.ok) throw friendlyError(response.status, body, response.headers);
  return body as T;
}

async function gcFetchAccount<T>(path: string, resource: AccountResource): Promise<{ data: T; rateLimit: RateLimitInfo }> {
  const accessToken = await token();
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw friendlyError(response.status, body, response.headers, resource);
  return { data: body as T, rateLimit: parseRateLimitHeaders(response.headers) };
}

export function accountTransactionsPath(accountId: string, date = new Date()): string {
  const { dateFrom, dateTo } = currentParisYearRange(date);
  const search = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return `/accounts/${encodeURIComponent(accountId)}/transactions/?${search.toString()}`;
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
    const [details, balanceResponse] = await Promise.all([
      gcFetch<{ account: { iban?: string; name?: string; product?: string; currency?: string } }>(`/accounts/${externalId}/details/`),
      gcFetchAccount<{ balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }>(`/accounts/${externalId}/balances/`, "balances"),
    ]);
    const balances = balanceResponse.data;
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
      last_synced_at: null,
      balance_quota_remaining: balanceResponse.rateLimit.remaining,
      balance_quota_reset_at: balanceResponse.rateLimit.resetAt,
    }, { onConflict: "external_id" });
  }));
  await supabase.from("bank_connections").update({ status: "linked", error_message: null, updated_at: new Date().toISOString() }).eq("id", connectionId);
}

async function importTransactions(account: BankAccount, rows: GoCardlessTransaction[], status: "booked" | "pending"): Promise<number> {
  const supabase = getSupabaseAdmin();
  const [categoriesResult, rulesResult, history] = await Promise.all([
    supabase.from("categories").select("*"),
    supabase.from("categorization_rules").select("*").order("priority", { ascending: false }),
    getCategorizationHistory(),
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
  const aiCandidates = prepared.filter((item) => {
    if (item.decision?.source === "rule") return false;
    if (!item.decision) return true;
    return findSimilarCategorizationExamples(item, history, categories, 1).length > 0;
  });
  const aiByTransaction = new Map<(typeof prepared)[number], CategoryDecision>();
  for (let offset = 0; offset < aiCandidates.length; offset += 50) {
    const batch = aiCandidates.slice(offset, offset + 50);
    try {
      const decisions = await categorizeWithAi(
        batch.map((item) => ({ description: item.description, amount: item.amount })),
        categories,
        history,
      );
      for (const [index, decision] of decisions) {
        const transaction = batch[index];
        if (transaction) aiByTransaction.set(transaction, decision);
      }
    } catch (error) {
      console.error("Catégorisation OpenAI indisponible", error);
    }
  }

  const records = prepared.map((item) => {
    const aiDecision = aiByTransaction.get(item);
    const decision = item.decision?.source === "rule"
      ? item.decision
      : aiDecision ?? item.decision ?? { categoryId: unclassified.id, source: "unclassified" as const, confidence: null };
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

function blockedResource(account: BankAccount, now = new Date()): { resource: AccountResource; resetAt: string | null } | null {
  const quotas: Array<{ resource: AccountResource; remaining: number | null; resetAt: string | null }> = [
    { resource: "balances", remaining: account.balance_quota_remaining, resetAt: account.balance_quota_reset_at },
    { resource: "transactions", remaining: account.transaction_quota_remaining, resetAt: account.transaction_quota_reset_at },
  ];
  return quotas.find((quota) => quota.remaining === 0 && (!quota.resetAt || new Date(quota.resetAt).getTime() > now.getTime())) ?? null;
}

export async function syncBankData(): Promise<{ imported: number; skipped: boolean }> {
  if (isDemoMode()) return { imported: 0, skipped: true };
  const supabase = getSupabaseAdmin();
  const { data: connections, error: connectionsError } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("status", "linked")
    .order("created_at", { ascending: false });
  if (connectionsError) throw connectionsError;
  if (!connections?.length) return { imported: 0, skipped: true };

  const { data: running } = await supabase.from("sync_runs").select("id").eq("status", "running").maybeSingle();
  if (running) return { imported: 0, skipped: true };
  let imported = 0;
  let successfulConnections = 0;
  let firstError: GoCardlessError | null = null;

  for (const connection of connections) {
    const { data: run, error: runError } = await supabase
      .from("sync_runs")
      .insert({ connection_id: connection.id, status: "running", trigger: "manual" })
      .select("id")
      .single();
    if (runError) {
      firstError ??= new GoCardlessError("SYNC_ERROR", runError.message);
      continue;
    }

    let activeAccount: BankAccount | null = null;
    try {
      const { data: accounts, error } = await supabase.from("bank_accounts").select("*").eq("connection_id", connection.id);
      if (error) throw error;
      let connectionImported = 0;
      for (const account of accounts as BankAccount[]) {
        activeAccount = account;
        const blocked = blockedResource(account);
        if (blocked) {
          throw new GoCardlessError("RATE_LIMIT", "Quota bancaire épuisé. Attendez son renouvellement avant de synchroniser.", 429, { remaining: 0, resetAt: blocked.resetAt }, blocked.resource);
        }

        // Vérifier le solde d'abord évite de consommer le quota transactions
        // lorsque le quota soldes, plus sollicité pendant l'onboarding, est épuisé.
        const balanceResponse = await gcFetchAccount<{ balances: Array<{ balanceAmount: { amount: string; currency: string }; balanceType: string }> }>(`/accounts/${account.external_id}/balances/`, "balances");
        await supabase.from("bank_accounts").update({
          balance_quota_remaining: balanceResponse.rateLimit.remaining,
          balance_quota_reset_at: balanceResponse.rateLimit.resetAt,
        }).eq("id", account.id);
        const transactionResponse = await gcFetchAccount<{ transactions: { booked?: GoCardlessTransaction[]; pending?: GoCardlessTransaction[] } }>(accountTransactionsPath(account.external_id), "transactions");
        await supabase.from("bank_accounts").update({
          transaction_quota_remaining: transactionResponse.rateLimit.remaining,
          transaction_quota_reset_at: transactionResponse.rateLimit.resetAt,
        }).eq("id", account.id);
        const balances = balanceResponse.data;
        const transactionData = transactionResponse.data;
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
      if (known.code === "RATE_LIMIT" && activeAccount && known.resource) {
        const remainingColumn = known.resource === "balances" ? "balance_quota_remaining" : "transaction_quota_remaining";
        const resetColumn = known.resource === "balances" ? "balance_quota_reset_at" : "transaction_quota_reset_at";
        await supabase.from("bank_accounts").update({
          [remainingColumn]: 0,
          [resetColumn]: known.rateLimit?.resetAt ?? addDays(new Date(), 1).toISOString(),
        }).eq("id", activeAccount.id);
      }
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
