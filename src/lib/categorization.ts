import OpenAI from "openai";
import { z } from "zod";
import { normalizeMerchant } from "./budget";
import type { Category } from "./types";

export interface CategoryDecision {
  categoryId: string;
  source: "rule" | "heuristic" | "ai" | "unclassified";
  confidence: number | null;
}

export interface CategorizationRule {
  matcher: string;
  match_type: "merchant" | "contains" | "regex";
  category_id: string;
  priority: number;
}

const heuristics: Record<string, string[]> = {
  courses: ["carrefour", "monoprix", "auchan", "lidl", "franprix", "picard", "leclerc", "intermarche"],
  restaurants: ["restaurant", "deliveroo", "uber eats", "just eat", "boulangerie", "cafe", "brasserie"],
  transport: ["sncf", "ratp", "navigo", "uber", "bolt", "totalenergies", "parking", "autoroute"],
  sante: ["pharmacie", "doctolib", "hopital", "mutuelle", "dentiste", "medecin"],
  abonnements: ["netflix", "spotify", "apple com bill", "google storage", "amazon prime", "free mobile", "orange"],
  logement: ["loyer", "electricite", "edf", "engie", "eau", "assurance habitation"],
  loisirs: ["cinema", "ugc", "pathe", "concert", "steam", "playstation"],
  shopping: ["amazon", "zara", "uniqlo", "ikea", "fnac", "decathlon"],
  "impots-frais": ["impot", "tresor public", "commission", "frais bancaire"],
  revenus: ["salaire", "remuneration", "paie", "caf", "remboursement"],
};

export function categorizeLocally(
  description: string,
  amount: number,
  categories: Category[],
  rules: CategorizationRule[],
): CategoryDecision | null {
  const merchant = normalizeMerchant(description);
  const sortedRules = rules.toSorted((a, b) => b.priority - a.priority);
  for (const rule of sortedRules) {
    let matches = false;
    if (rule.match_type === "merchant") matches = merchant === rule.matcher;
    if (rule.match_type === "contains") matches = merchant.includes(rule.matcher);
    if (rule.match_type === "regex") {
      try { matches = new RegExp(rule.matcher, "i").test(merchant); } catch { matches = false; }
    }
    if (matches) return { categoryId: rule.category_id, source: "rule", confidence: 1 };
  }

  for (const [slug, keywords] of Object.entries(heuristics)) {
    if (keywords.some((keyword) => merchant.includes(keyword))) {
      const category = categories.find((item) => item.slug === (amount > 0 && slug !== "revenus" ? "revenus" : slug));
      if (category) return { categoryId: category.id, source: "heuristic", confidence: 0.92 };
    }
  }
  if (amount > 0) {
    const income = categories.find((item) => item.slug === "revenus");
    if (income) return { categoryId: income.id, source: "heuristic", confidence: 0.75 };
  }
  return null;
}

const aiResponseSchema = z.object({
  decisions: z.array(z.object({ index: z.number().int(), category_slug: z.string(), confidence: z.number().min(0).max(1) })),
});

export function parseAiCategorizationResponse(value: string) {
  return aiResponseSchema.parse(JSON.parse(value));
}

export async function categorizeWithAi(
  inputs: Array<{ description: string; amount: number }>,
  categories: Category[],
): Promise<Map<number, CategoryDecision>> {
  const results = new Map<number, CategoryDecision>();
  if (!process.env.OPENAI_API_KEY || inputs.length === 0) return results;
  const allowed = categories.filter((item) => item.kind !== "transfer").map((item) => item.slug);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
    reasoning: { effort: "none" },
    input: [
      {
        role: "system",
        content: `Classe des opérations bancaires françaises. Réponds uniquement selon le schéma. Catégories autorisées: ${allowed.join(", ")}. Une confiance inférieure à 0,72 doit utiliser a-classer.`,
      },
      {
        role: "user",
        content: JSON.stringify(inputs.map((item, index) => ({ index, libelle: normalizeMerchant(item.description), sens: item.amount < 0 ? "depense" : "revenu" }))),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "transaction_categories",
        strict: true,
        schema: {
          type: "object",
          properties: {
            decisions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer" },
                  category_slug: { type: "string", enum: allowed },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["index", "category_slug", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["decisions"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = parseAiCategorizationResponse(response.output_text);
  const unclassified = categories.find((item) => item.slug === "a-classer")!;
  for (const decision of parsed.decisions) {
    const category = categories.find((item) => item.slug === decision.category_slug);
    results.set(decision.index, {
      categoryId: decision.confidence >= 0.72 && category ? category.id : unclassified.id,
      source: decision.confidence >= 0.72 && category ? "ai" : "unclassified",
      confidence: decision.confidence,
    });
  }
  return results;
}
