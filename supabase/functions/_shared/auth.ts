import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Resolves which signed-in user is calling a function. Both callers set
 *  verify_jwt = true in config.toml, so Supabase has already rejected the
 *  request if the Authorization header wasn't a valid session -- this only
 *  needs to read *whose* session it was, using the anon key (never the
 *  service-role one, which ignores the caller's identity entirely). */
export async function resolveUserId(req: Request): Promise<string | null> {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return null;
    const client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authorization } } },
    );
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
}
