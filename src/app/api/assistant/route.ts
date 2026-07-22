import { NextResponse } from "next/server";
import { askBudgetAssistant, assistantRequestSchema } from "@/lib/budget-assistant";
import { requireApiSession } from "@/lib/session";

export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const body = assistantRequestSchema.parse(await request.json());
    const result = await askBudgetAssistant(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "L'assistant est temporairement indisponible.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
