import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Rafraîchit les cookies Supabase sans remplacer la protection PIN. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headersToSet).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  // getClaims valide le JWT et déclenche son rafraîchissement si nécessaire.
  // Ne pas remplacer par getSession pour une décision d'autorisation.
  await supabase.auth.getClaims();

  return response;
}
