import { describe, expect, it } from "vitest";
import {
  categorizeLocally,
  findSimilarCategorizationExamples,
  parseAiCategorizationResponse,
  sanitizeTransactionLabelForAi,
  transactionLabelSimilarity,
  type HistoricalCategorizationExample,
} from "./categorization";
import type { Category } from "./types";

const categories: Category[] = [
  { id: "food", slug: "courses", name: "Courses", color: "#000", icon: "basket", kind: "expense", is_system: true, sort_order: 1 },
  { id: "income", slug: "revenus", name: "Revenus", color: "#000", icon: "wallet", kind: "income", is_system: true, sort_order: 2 },
  { id: "unknown", slug: "a-classer", name: "À classer", color: "#000", icon: "help", kind: "uncategorized", is_system: true, sort_order: 3 },
];

const history: HistoricalCategorizationExample[] = [
  { description: "NETFLIX COM PARIS", amount: -15, categoryId: "food", source: "manual", confidence: 1, manuallyCategorized: true },
  { description: "CARREFOUR CITY", amount: -30, categoryId: "food", source: "heuristic", confidence: 0.92, manuallyCategorized: false },
  { description: "NETFLIX REMBOURSEMENT", amount: 15, categoryId: "income", source: "manual", confidence: 1, manuallyCategorized: true },
];

describe("priorité de catégorisation", () => {
  it("préfère une règle utilisateur aux heuristiques", () => {
    const result = categorizeLocally("Carrefour City", -30, categories, [{ matcher: "carrefour city", match_type: "merchant", category_id: "unknown", priority: 1000 }]);
    expect(result).toEqual({ categoryId: "unknown", source: "rule", confidence: 1 });
  });
  it("reconnaît les courses sans règle", () => expect(categorizeLocally("CB CARREFOUR", -30, categories, [])).toMatchObject({ categoryId: "food", source: "heuristic" }));
  it("valide strictement le format IA", () => {
    expect(parseAiCategorizationResponse('{"decisions":[{"index":0,"category_slug":"courses","confidence":0.91}]}').decisions[0].confidence).toBe(.91);
    expect(() => parseAiCategorizationResponse('{"decisions":[{"index":"0","category_slug":"courses","confidence":2}]}')).toThrow();
  });
  it("retire IBAN, e-mail et numéros du libellé envoyé à OpenAI", () => {
    expect(sanitizeTransactionLabelForAi("VIR FR76 3000 6000 0112 3456 7890 189 client@example.com REF 123456789")).toBe("vir ref");
  });
  it("reconnaît deux variantes du même commerçant", () => {
    expect(transactionLabelSimilarity("CB NETFLIX.COM 1234", "NETFLIX COM PARIS")).toBeGreaterThan(0.5);
    expect(transactionLabelSimilarity("NETFLIX", "PHARMACIE CENTRALE")).toBe(0);
  });
  it("propose les opérations historiques similaires du même sens", () => {
    const examples = findSimilarCategorizationExamples({ description: "PAIEMENT NETFLIX COM", amount: -18 }, history, categories);
    expect(examples[0]).toMatchObject({ categorySlug: "courses", direction: "depense", origin: "correction_manuelle" });
    expect(examples).toHaveLength(1);
  });
});
