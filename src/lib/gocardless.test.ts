import { afterEach, describe, expect, it, vi } from "vitest";
import { accountTransactionsPath, findBoursoInstitution, parseRateLimitHeaders } from "./gocardless";

describe("sélection dynamique BoursoBank", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GOCARDLESS_SANDBOX; });
  it("utilise l’institution de sandbox lorsque demandée", async () => {
    process.env.GOCARDLESS_SANDBOX = "true";
    await expect(findBoursoInstitution()).resolves.toMatchObject({ id: "SANDBOXFINANCE_SFIN0000" });
  });
  it("cherche BoursoBank dans la liste française", async () => {
    process.env.GOCARDLESS_SECRET_ID = "id";
    process.env.GOCARDLESS_SECRET_KEY = "key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access: "token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "BOURSORAMA_BOUSFRPPXXX", name: "BoursoBank", max_access_valid_for_days: "90", transaction_total_days: "730" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(findBoursoInstitution()).resolves.toMatchObject({ name: "BoursoBank" });
    expect(fetchMock.mock.calls[1][0]).toContain("institutions/?country=fr");
  });
});

describe("historique de synchronisation", () => {
  it("demande toutes les opérations depuis le 1er janvier à Paris", () => {
    const path = accountTransactionsPath("account/id", new Date("2026-07-16T08:00:00Z"));
    expect(path).toBe("/accounts/account%2Fid/transactions/?date_from=2026-01-01&date_to=2026-07-16");
  });

  it("utilise déjà la nouvelle année pendant la nuit du réveillon à Paris", () => {
    const path = accountTransactionsPath("account", new Date("2025-12-31T23:30:00Z"));
    expect(path).toContain("date_from=2026-01-01&date_to=2026-01-01");
  });
});

describe("quota GoCardless", () => {
  it("lit le quota par compte et convertit le délai de réinitialisation", () => {
    const headers = new Headers({
      "X-RateLimit-Account-Success-Remaining": "3",
      "X-RateLimit-Account-Success-Reset": "3600",
    });
    expect(parseRateLimitHeaders(headers, new Date("2026-07-16T12:00:00Z"))).toEqual({
      remaining: 3,
      resetAt: "2026-07-16T13:00:00.000Z",
    });
  });
});
