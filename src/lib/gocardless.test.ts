import { afterEach, describe, expect, it, vi } from "vitest";
import { findBoursoInstitution } from "./gocardless";

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
