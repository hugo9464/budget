import { describe, expect, it } from "vitest";
import { categorizeLocally, parseAiCategorizationResponse } from "./categorization";
import type { Category } from "./types";

const categories: Category[] = [
  { id: "food", slug: "courses", name: "Courses", color: "#000", icon: "basket", kind: "expense", is_system: true, sort_order: 1 },
  { id: "income", slug: "revenus", name: "Revenus", color: "#000", icon: "wallet", kind: "income", is_system: true, sort_order: 2 },
  { id: "unknown", slug: "a-classer", name: "À classer", color: "#000", icon: "help", kind: "uncategorized", is_system: true, sort_order: 3 },
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
});
