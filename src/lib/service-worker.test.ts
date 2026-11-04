// Runs public/sw.js against a fake network and Cache API: which requests it
// caches, what it serves offline, and that signing out forgets saved screens.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://adupay.test";

type Handler = (event: FakeEvent) => void;
interface FakeEvent {
  request?: Request;
  data?: unknown;
  respondWith?: (r: Promise<Response>) => void;
  waitUntil: (p: Promise<unknown>) => void;
}

class FakeCache {
  store = new Map<string, Response>();
  async match(req: Request | string) {
    return this.store.get(typeof req === "string" ? new URL(req, ORIGIN).href : req.url)?.clone();
  }
  async put(req: Request | string, res: Response) {
    this.store.set(typeof req === "string" ? new URL(req, ORIGIN).href : req.url, res);
  }
  async addAll(urls: string[]) {
    for (const u of urls) this.store.set(new URL(u, ORIGIN).href, new Response(`precached ${u}`));
  }
}

let handlers: Record<string, Handler>;
let cacheStore: Map<string, FakeCache>;
let online: boolean;
let network: (req: Request) => Response;
let fetched: string[];

function load() {
  handlers = {};
  cacheStore = new Map();
  const caches = {
    open: async (name: string) => cacheStore.get(name) ?? cacheStore.set(name, new FakeCache()).get(name)!,
    keys: async () => [...cacheStore.keys()],
    delete: async (name: string) => cacheStore.delete(name),
    match: async (req: Request | string) => {
      for (const c of cacheStore.values()) {
        const hit = await c.match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fakeFetch = async (req: Request) => {
    fetched.push(new URL(req.url).pathname);
    if (!online) throw new TypeError("offline");
    return network(req);
  };
  new Function("self", "caches", "fetch", "Response", "URL", "setTimeout", source)(self, caches, fakeFetch, Response, URL, setTimeout);
}

async function dispatch(type: string, init: Partial<FakeEvent>) {
  const waits: Promise<unknown>[] = [];
  let response: Promise<Response> | undefined;
  handlers[type]({ ...init, waitUntil: (p) => waits.push(p), respondWith: (r) => (response = r) });
  await Promise.all(waits);
  return response;
}

const navigate = (path: string) => {
  const req = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(req, "mode", { value: "navigate" });
  return dispatch("fetch", { request: req });
};
/** Mimics Response.redirected/type, which a plain new Response() cannot set. */
const page = (body: string, opts: { redirected?: boolean; status?: number } = {}) => {
  const r = new Response(body, { status: opts.status ?? 200 });
  Object.defineProperty(r, "type", { value: "basic" });
  Object.defineProperty(r, "redirected", { value: !!opts.redirected });
  return r;
};

beforeEach(async () => {
  online = true;
  fetched = [];
  network = (req) => page(`live ${new URL(req.url).pathname}`);
  load();
  await dispatch("install", {});
  await dispatch("activate", {});
});

describe("service worker", () => {
  it("precaches the offline page on install", async () => {
    expect(await (await (await caches()).match("/hors-ligne"))?.text()).toBe("precached /hors-ligne");
  });

  it("shows the last saved copy of a key screen when offline", async () => {
    expect(await (await navigate("/accueil"))!.text()).toBe("live /accueil");
    online = false;
    expect(await (await navigate("/accueil"))!.text()).toBe("live /accueil");
    expect(await (await navigate("/tontines/fadbda89-54ba-4629-a42d-310a82d575a0"))!.text()).toBe("precached /hors-ligne");
  });

  it("never saves a redirect (e.g. to sign-in) or an error page", async () => {
    network = () => page("sign-in page", { redirected: true });
    await navigate("/profil");
    network = () => page("oops", { status: 500 });
    await navigate("/notifications");
    expect(cacheStore.get("adupay-pages")?.store.size ?? 0).toBe(0);
  });

  it("does not save other screens, the API, admin or non-GET requests", async () => {
    await navigate("/admin");
    await navigate("/payer-pour/nouveau");
    expect(cacheStore.get("adupay-pages")?.store.size ?? 0).toBe(0);
    expect(await dispatch("fetch", { request: new Request(`${ORIGIN}/api/cron/tontines`) })).toBeUndefined();
    expect(await dispatch("fetch", { request: new Request(`${ORIGIN}/accueil`, { method: "POST" }) })).toBeUndefined();
    expect(await dispatch("fetch", { request: new Request("https://xhjvajbivwabczgwgipk.supabase.co/rest/v1/x") })).toBeUndefined();
  });

  it("serves hashed static files from cache after the first load", async () => {
    const req = () => new Request(`${ORIGIN}/_next/static/chunks/app.js`);
    await (await dispatch("fetch", { request: req() }))!.text();
    online = false;
    expect(await (await dispatch("fetch", { request: req() }))!.text()).toBe("live /_next/static/chunks/app.js");
  });

  it("signing out deletes the saved screens", async () => {
    await navigate("/accueil");
    expect(cacheStore.has("adupay-pages")).toBe(true);
    await dispatch("message", { data: "clear-pages" });
    expect(cacheStore.has("adupay-pages")).toBe(false);
    online = false;
    expect(await (await navigate("/accueil"))!.text()).toBe("precached /hors-ligne");
  });
});

async function caches() {
  return { match: async (u: string) => [...cacheStore.values()].reduce<Promise<Response | undefined>>(async (acc, c) => (await acc) ?? c.match(u), Promise.resolve(undefined)) };
}
