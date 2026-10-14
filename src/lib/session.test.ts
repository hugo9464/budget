import { afterEach, describe, expect, it } from "vitest";
import { createBankCallbackToken, verifyBankCallbackToken } from "./session";

describe("jeton de callback bancaire", () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("autorise uniquement la connexion liée au jeton", async () => {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";
    const token = await createBankCallbackToken("connection-a");

    await expect(verifyBankCallbackToken(token, "connection-a")).resolves.toBe(true);
    await expect(verifyBankCallbackToken(token, "connection-b")).resolves.toBe(false);
  });

  it("refuse un jeton invalide", async () => {
    process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";
    await expect(verifyBankCallbackToken("invalid", "connection-a")).resolves.toBe(false);
  });
});
