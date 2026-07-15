import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client SSR lié à la session Supabase de la requête courante.
 * Pour les opérations privilégiées de l'application, utiliser admin.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Les Server Components ne peuvent pas écrire les cookies.
            // Le proxy racine se charge du rafraîchissement de session.
          }
        },
      },
    },
  );
}
