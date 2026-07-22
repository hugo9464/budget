import OpenAI from "openai";
import { z } from "zod";
import { normalizeMerchant } from "./budget";
import type { Category, CategorySource } from "./types";

export const OPENAI_CATEGORIZATION_MODEL = "gpt-5.4-nano";

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

export interface HistoricalCategorizationExample {
  description: string;
  amount: number;
  categoryId: string;
  source: CategorySource;
  confidence: number | null;
  manuallyCategorized: boolean;
}

export interface SimilarCategorizationExample {
  label: string;
  direction: "depense" | "revenu";
  categorySlug: string;
  similarity: number;
  origin: "correction_manuelle" | "historique";
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

export function sanitizeTransactionLabelForAi(value: string): string {
  return normalizeMerchant(
    value
      .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, " ")
      .replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi, " ")
      .replace(/\b(?:\+?\d[\s().-]?){8,}\b/g, " "),
  ).slice(0, 120);
}

const similarityStopWords = new Set([
  "achat",
  "cb",
  "carte",
  "facture",
  "paiement",
  "prelevement",
  "prlv",
  "ref",
  "sepa",
  "vir",
  "virement",
]);

function labelTokens(value: string): Set<string> {
  return new Set(
    sanitizeTransactionLabelForAi(value)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !similarityStopWords.has(token)),
  );
}

export function transactionLabelSimilarity(left: string, right: string): number {
  const normalizedLeft = sanitizeTransactionLabelForAi(left);
  const normalizedRight = sanitizeTransactionLabelForAi(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = labelTokens(normalizedLeft);
  const rightTokens = labelTokens(normalizedRight);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (intersection === 0) return 0;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const jaccard = intersection / union;
  return Math.min(0.99, (containment * 0.7) + (jaccard * 0.3));
}

function historicalReliability(example: HistoricalCategorizationExample): number {
  if (example.manuallyCategorized || example.source === "manual") return 1;
  if (example.source === "rule") return 0.98;
  if (example.source === "heuristic") return 0.9;
  if (example.source === "ai") return example.confidence ?? 0.72;
  return 0;
}

export function findSimilarCategorizationExamples(
  input: { description: string; amount: number },
  history: HistoricalCategorizationExample[],
  categories: Category[],
  limit = 4,
): SimilarCategorizationExample[] {
  const direction: SimilarCategorizationExample["direction"] = input.amount < 0 ? "depense" : "revenu";
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const candidates = history.flatMap((example) => {
    if ((example.amount < 0 ? "depense" : "revenu") !== direction) return [];
    const category = categoryById.get(example.categoryId);
    if (!category || category.kind === "transfer" || category.kind === "uncategorized") return [];
    if (direction === "depense" && category.kind !== "expense") return [];
    if (direction === "revenu" && category.kind !== "income") return [];
    const similarity = transactionLabelSimilarity(input.description, example.description);
    if (similarity < 0.35) return [];
    return [{
      label: sanitizeTransactionLabelForAi(example.description),
      direction,
      categorySlug: category.slug,
      similarity,
      reliability: historicalReliability(example),
      origin: example.manuallyCategorized || example.source === "manual" ? "correction_manuelle" as const : "historique" as const,
    }];
  }).toSorted((left, right) => right.similarity - left.similarity || right.reliability - left.reliability);

  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const key = `${candidate.label}:${candidate.categorySlug}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      label: candidate.label,
      direction: candidate.direction,
      categorySlug: candidate.categorySlug,
      similarity: candidate.similarity,
      origin: candidate.origin,
    }];
  }).slice(0, limit);
}

export async function categorizeWithAi(
  inputs: Array<{ description: string; amount: number }>,
  categories: Category[],
  history: HistoricalCategorizationExample[] = [],
): Promise<Map<number, CategoryDecision>> {
  const results = new Map<number, CategoryDecision>();
  if (!process.env.OPENAI_API_KEY || inputs.length === 0) return results;
  const allowed = categories.filter((item) => item.kind !== "transfer").map((item) => item.slug);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: OPENAI_CATEGORIZATION_MODEL,
    reasoning: { effort: "none" },
    input: [
      {
        role: "system",
        content: `Classe des opérations bancaires françaises. Réponds uniquement selon le schéma. Catégories autorisées: ${categories.filter((item) => item.kind !== "transfer").map((item) => `${item.slug} (${item.name}, ${item.kind})`).join(", ")}. Respecte le sens revenu/dépense. Les exemples similaires viennent des opérations déjà catégorisées. Réutilise leur catégorie seulement si le libellé et le sens sont nettement similaires et si les exemples sont cohérents; privilégie une correction_manuelle. Sinon, classe normalement. Une confiance inférieure à 0,72 doit utiliser a-classer.`,
      },
      {
        role: "user",
        content: JSON.stringify(inputs.map((item, index) => ({
          index,
          libelle: sanitizeTransactionLabelForAi(item.description),
          sens: item.amount < 0 ? "depense" : "revenu",
          exemples_similaires: findSimilarCategorizationExamples(item, history, categories).map((example) => ({
            libelle: example.label,
            sens: example.direction,
            categorie: example.categorySlug,
            similarite: Number(example.similarity.toFixed(2)),
            origine: example.origin,
          })),
        }))),
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
