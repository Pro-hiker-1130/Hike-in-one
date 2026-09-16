// Stateless Strava API proxy.
//
// The browser calls this (via supabase.functions.invoke, so it's already
// subject to the project's normal JWT check — no need to turn that off
// here, unlike strava-callback) because Strava's API doesn't send CORS
// headers a browser will accept, and refreshing an access token needs
// the app's Strava client secret, which can never ship to the browser.
//
// This function holds no state of its own: the caller sends whatever
// Strava tokens it currently has (accessToken/refreshToken/expiresAt),
// and gets back both the requested data AND the possibly-refreshed
// tokens, which it is responsible for storing (this app keeps them in
// localStorage, one Strava connection per device).
//
// Required secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (same values
// used by strava-callback).

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const tokens = await ensureFreshTokens(body);

    if (body.action === "activities") {
      const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Strava activities request failed");
      const activities = (data as any[]).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        distanceMeters: a.distance,
        startDate: a.start_date,
        movingTimeSec: a.moving_time,
      }));
      return json({ activities, tokens });
    }

    if (body.action === "gpx") {
      const { activityId, activityName, startDate } = body;
      const res = await fetch(
        `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time&key_by_type=true`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      );
      const streams = await res.json();
      if (!res.ok) throw new Error(streams.message || "Strava streams request failed");
      if (!streams.latlng) throw new Error("This activity has no GPS data.");
      const gpx = buildGpx({
        name: activityName || `Strava activity ${activityId}`,
        startDateIso: startDate,
        latlng: streams.latlng.data,
        altitude: streams.altitude ? streams.altitude.data : null,
        timeOffsets: streams.time ? streams.time.data : null,
      });
      return json({ gpx, tokens });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

async function ensureFreshTokens(body: Partial<StravaTokens>): Promise<StravaTokens> {
  const { accessToken, refreshToken, expiresAt } = body;
  if (!refreshToken) throw new Error("Missing Strava tokens — reconnect Strava.");

  const now = Math.floor(Date.now() / 1000);
  if (accessToken && expiresAt && expiresAt - now > 60) {
    return { accessToken, refreshToken, expiresAt };
  }

  const form = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Could not refresh Strava token — reconnect Strava.");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}

function buildGpx(opts: {
  name: string;
  startDateIso: string | null;
  latlng: [number, number][];
  altitude: number[] | null;
  timeOffsets: number[] | null;
}): string {
  const startMs = opts.startDateIso ? new Date(opts.startDateIso).getTime() : null;
  const points = opts.latlng
    .map(([lat, lon], i) => {
      let s = `<trkpt lat="${lat}" lon="${lon}">`;
      if (opts.altitude && opts.altitude[i] != null) s += `<ele>${opts.altitude[i]}</ele>`;
      if (startMs != null && opts.timeOffsets && opts.timeOffsets[i] != null) {
        s += `<time>${new Date(startMs + opts.timeOffsets[i] * 1000).toISOString()}</time>`;
      }
      s += "</trkpt>";
      return s;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Hike-in-one (via Strava)" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escapeXml(
    opts.name,
  )}</name><trkseg>${points}</trkseg></trk></gpx>`;
}

function escapeXml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
