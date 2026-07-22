import { NextResponse } from "next/server";
import { categorizeUnclassifiedTransactionsWithAi } from "@/lib/ai-categorization";
import { requireApiSession } from "@/lib/session";

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await categorizeUnclassifiedTransactionsWithAi());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catégorisation OpenAI impossible" },
      { status: 503 },
    );
  }
}
