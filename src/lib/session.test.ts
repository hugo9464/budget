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

describe("connexion email et mot de passe", () => {
  afterEach(() => {
    delete process.env.AUTH_EMAIL;
    delete process.env.AUTH_PASSWORD_HASH;
    delete process.env.DEMO_MODE;
  });

  it("accepte uniquement l’email et le mot de passe configurés", async () => {
    const { default: bcrypt } = await import("bcryptjs");
    const { verifyCredentials } = await import("./session");
    process.env.AUTH_EMAIL = "Moi@Exemple.fr";
    process.env.AUTH_PASSWORD_HASH = await bcrypt.hash("un mot de passe solide", 4);
    await expect(verifyCredentials(" moi@exemple.fr ", "un mot de passe solide")).resolves.toBe(true);
    await expect(verifyCredentials("moi@exemple.fr", "mauvais")).resolves.toBe(false);
    await expect(verifyCredentials("intrus@exemple.fr", "un mot de passe solide")).resolves.toBe(false);
  });

  it("accepte le mot de passe de démo uniquement en mode démo", async () => {
    const { verifyCredentials } = await import("./session");
    process.env.DEMO_MODE = "true";
    await expect(verifyCredentials("moi@exemple.fr", "demo1234")).resolves.toBe(true);
    await expect(verifyCredentials("moi@exemple.fr", "autre")).resolves.toBe(false);
  });
});
