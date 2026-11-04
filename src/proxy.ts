import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { buildCsp, cspNonce } from "@/lib/csp";

// App sections that need a signed-in user. The layout re-checks on the server;
// this is only the fast, cookie-based first pass.
const PROTECTED = ["/accueil", "/tontines", "/payer-pour", "/epargne", "/profil", "/envoyer", "/rejoindre", "/payee", "/bienvenue", "/admin", "/notifications", "/ussd", "/credit", "/securite-admin"];

export async function proxy(request: NextRequest) {
  // A fresh nonce per request: Next adds it to its own scripts (it reads the CSP
  // request header) and the root layout passes x-nonce to the theme script.
  const nonce = cspNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Refreshes the session cookie when needed. Verifies the JWT; no database query.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    // Bring people back to an invite link after they sign in.
    if (path.startsWith("/rejoindre/") || path === "/payee" || path.startsWith("/payee/") || path === "/admin" || path.startsWith("/admin/")) url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (signedIn && path === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/accueil";
    return NextResponse.redirect(url);
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets, images and API routes (webhooks authenticate themselves).
  matcher: ["/((?!api/|_next/static|_next/image|brand/|icons/|icon.svg|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
