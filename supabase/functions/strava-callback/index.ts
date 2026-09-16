// Strava OAuth callback.
//
// Strava redirects the user's browser here directly (a plain top-level
// navigation, not a fetch call from our app), so there is no Supabase
// auth header on the request. In the Supabase dashboard, this function's
// "Enforce JWT Verification" setting must be turned OFF, or every
// redirect will be rejected before this code ever runs.
//
// This function holds no state between requests: it exchanges the ?code
// for Strava tokens and redirects straight back to the app (the URL the
// app itself put in ?state before sending the user to Strava) with the
// tokens in the URL *fragment* (#...), which browsers never send to a
// server — mirroring how Supabase's own OAuth flow does it. The app reads
// them from location.hash on load and stores them itself.
//
// Required secrets (Project Settings -> Edge Functions -> Secrets, or
// this function's own Secrets tab): STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET.

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const returnTo = safeReturnUrl(url.searchParams.get("state"));

  if (!returnTo) {
    return new Response("Missing or invalid state parameter.", { status: 400 });
  }

  if (oauthError || !code) {
    return Response.redirect(
      returnTo + "#strava_error=" + encodeURIComponent(oauthError || "missing_code"),
      302,
    );
  }

  try {
    const body = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.message || "Strava token exchange failed");

    const params = new URLSearchParams({
      strava_access_token: tokenData.access_token,
      strava_refresh_token: tokenData.refresh_token,
      strava_expires_at: String(tokenData.expires_at),
    });
    return Response.redirect(returnTo + "#" + params.toString(), 302);
  } catch (e) {
    return Response.redirect(
      returnTo + "#strava_error=" + encodeURIComponent(String((e as Error).message || e)),
      302,
    );
  }
});

// Only ever redirect back to an http(s) URL — state is a value Strava
// relays verbatim from the browser, so treat it as untrusted input.
function safeReturnUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const u = new URL(decoded);
    if (u.protocol === "http:" || u.protocol === "https:") return decoded;
  } catch (_e) {
    // fall through
  }
  return null;
}
