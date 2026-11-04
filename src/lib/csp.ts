// Content-Security-Policy for pages. Scripts run only with this request's nonce
// ('strict-dynamic' lets those scripts load Next's own chunks), so an injected
// <script> or inline handler is blocked. Styles stay 'unsafe-inline': Tailwind
// and Next set inline styles, and styles cannot run code.

export function cspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string, { dev = false, supabaseUrl = "" }: { dev?: boolean; supabaseUrl?: string } = {}): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supabase ? [supabase.origin] : [])],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(supabase ? [supabase.origin, `wss://${supabase.host}`] : []), ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
