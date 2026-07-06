import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// -- Public route allowlist --------------------------------------------
//
// Anything not in this list (and not a static-asset prefix) requires a
// Supabase Auth session cookie. The proxy checks cookie *presence* only —
// Edge runtime can't reach Postgres, so route handlers and Server Components
// re-validate via supabase.auth.getUser().

const PUBLIC_PATHS = [
  "/login",
  "/landing",
  "/trust",
  "/privacy",
  "/terms",
  "/auth/callback",
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/sync",
  "/api/aggregators/truelayer/webhook",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/robots.txt",
];

const STATIC_PREFIXES = ["/_next/", "/static/"];

function isPublic(pathname: string): boolean {
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return PUBLIC_PATHS.includes(pathname);
}

function hasSupabaseSession(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => c.name.includes("-auth-token") && c.value.length > 0);
}

// -- Security headers --------------------------------------------------

const isDev = process.env.NODE_ENV === "development";

function supabaseConnectOrigin(): string | undefined {
  const url = process.env.SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

const connectSrc = ["'self'", "https://api.anthropic.com", supabaseConnectOrigin()]
  .filter(Boolean)
  .join(" ");

const CSP = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Content-Security-Policy", CSP);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!hasSupabaseSession(req)) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(NextResponse.json({ error: "unauthenticated" }, { status: 401 }));
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return applySecurityHeaders(NextResponse.redirect(login, 303));
  }

  // Refresh Supabase session in proxy (Route Handler / middleware context) so
  // Server Components can read cookies without mutating them.
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    let res = applySecurityHeaders(NextResponse.next({ request: req }));
    const supabase = createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = applySecurityHeaders(NextResponse.next({ request: req }));
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
    return res;
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
