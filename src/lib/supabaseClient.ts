import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY do not exist yet in
// .env or .env.local (checked before writing this) — add them with real
// values from the Supabase dashboard (Project Settings → API) before this
// module is used. The `!` assertions below only silence TypeScript; an
// unset value will still fail at runtime when createClient() is called.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Builds a new Supabase client scoped to a single Clerk session token.
 *
 * This is deliberately a builder, not a shared singleton: Next.js server
 * components/route handlers/server actions can process concurrent requests
 * from different signed-in users within the same Node.js process. A single
 * shared client with mutated auth state would risk one request's token
 * leaking into another's concurrent request. Calling this once per request
 * with that request's own token keeps every request's identity isolated.
 *
 * The returned client sends `clerkToken` as a static Authorization header on
 * every request (the documented pattern for Supabase Third-Party Auth
 * integrations), so `auth.jwt()` in RLS policies resolves from Clerk's JWT
 * rather than a Supabase-native session — which this client never manages
 * itself, hence `persistSession`/`autoRefreshToken` are both disabled.
 */
export function getSupabaseClient(clerkToken?: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: clerkToken
      ? {
          headers: {
            Authorization: `Bearer ${clerkToken}`,
          },
        }
      : undefined,
  });
}
