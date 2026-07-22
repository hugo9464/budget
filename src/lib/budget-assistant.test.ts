import { describe, expect, it } from "vitest";
import { assistantRequestSchema, createCategorySchema } from "./budget-assistant";

describe("assistantRequestSchema", () => {
  it("accepte une conversation courte", () => {
    const result = assistantRequestSchema.parse({
      message: "Combien ai-je dépensé ce mois-ci ?",
      history: [{ role: "assistant", content: "Sur quelle période ?" }],
    });
    expect(result.history).toHaveLength(1);
  });

  it("refuse un message vide", () => {
    expect(() => assistantRequestSchema.parse({ message: "   ", history: [] })).toThrow();
  });

  it("limite l'historique envoyé au serveur", () => {
    const history = Array.from({ length: 11 }, (_, index) => ({ role: "user" as const, content: `Message ${index}` }));
    expect(() => assistantRequestSchema.parse({ message: "Question", history })).toThrow();
  });
});

describe("createCategorySchema", () => {
  it("accepte une catégorie de dépense avec les valeurs visuelles automatiques", () => {
    expect(createCategorySchema.parse({ name: "Animaux", kind: "expense", color: null, icon: null })).toEqual({
      name: "Animaux", kind: "expense", color: null, icon: null,
    });
  });

  it("refuse une couleur ou un type non autorisé", () => {
    expect(() => createCategorySchema.parse({ name: "Test", kind: "transfer", color: "bleu", icon: null })).toThrow();
  });
});
