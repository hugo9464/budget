import { createBrowserClient } from "@supabase/ssr";

/**
 * Client destiné exclusivement aux Client Components.
 * La clé publishable est publique par conception ; RLS reste l'autorité.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
