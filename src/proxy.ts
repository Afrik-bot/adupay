import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// App sections that need a signed-in user. The layout re-checks on the server;
// this is only the fast, cookie-based first pass.
const PROTECTED = ["/accueil", "/tontines", "/payer-pour", "/epargne", "/profil", "/envoyer", "/rejoindre", "/payee", "/bienvenue", "/admin", "/notifications", "/ussd"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
  return response;
}

export const config = {
  // Skip static assets, images and API routes (webhooks authenticate themselves).
  matcher: ["/((?!api/|_next/static|_next/image|brand/|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
