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

describe("connexion par code email", () => {
  afterEach(() => {
    delete process.env.ALLOWED_EMAILS;
    delete process.env.DEMO_MODE;
  });

  it("n’autorise que les adresses de la liste blanche, sans tenir compte de la casse", async () => {
    const { isAllowedEmail } = await import("./session");
    process.env.ALLOWED_EMAILS = "Moi@Exemple.fr, autre@exemple.fr";
    expect(isAllowedEmail(" moi@exemple.fr ")).toBe(true);
    expect(isAllowedEmail("autre@exemple.fr")).toBe(true);
    expect(isAllowedEmail("intrus@exemple.fr")).toBe(false);
  });

  it("accepte le code de démo uniquement en mode démo", async () => {
    const { verifyEmailCode } = await import("./session");
    process.env.DEMO_MODE = "true";
    await expect(verifyEmailCode("moi@exemple.fr", "123456")).resolves.toBe(true);
    await expect(verifyEmailCode("moi@exemple.fr", "654321")).resolves.toBe(false);
    await expect(verifyEmailCode("moi@exemple.fr", "12")).resolves.toBe(false);
  });
});
