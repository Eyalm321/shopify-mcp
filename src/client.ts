import { readFileSync } from "node:fs";

const DEFAULT_ADMIN_API_VERSION = "2026-04";
const DEFAULT_PARTNER_API_VERSION = "2026-07";

export interface StoreAccount {
  name: string;
  type: "store";
  storeDomain: string;
  /** Static Admin API token. Absent when using client-credentials auth. */
  accessToken?: string;
  /** Dev Dashboard app client ID for the OAuth client-credentials grant. */
  clientId?: string;
  clientSecret?: string;
  apiVersion: string;
  storefrontAccessToken?: string;
}

export interface PartnerAccount {
  name: string;
  type: "partner";
  organizationId: string;
  accessToken: string;
  apiVersion: string;
}

export type Account = StoreAccount | PartnerAccount;
export type AccountType = Account["type"];

interface ParsedEntry {
  name?: string;
  type?: string;
  storeDomain?: string;
  domain?: string;
  store?: string;
  shop?: string;
  accessToken?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  apiVersion?: string;
  storefrontAccessToken?: string;
  organizationId?: string | number;
  orgId?: string | number;
}

let cachedAccounts: Map<string, Account> | null = null;
let cachedSnapshot: string | undefined;

const ENV_VARS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_ACCESS_TOKEN",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_API_VERSION",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "SHOPIFY_PARTNER_ORGANIZATION_ID",
  "SHOPIFY_PARTNER_ACCESS_TOKEN",
  "SHOPIFY_PARTNER_API_VERSION",
  "SHOPIFY_ACCOUNTS_FILE",
] as const;

function envSnapshot(): string {
  return ENV_VARS.map((k) => `${k}=${process.env[k] ?? ""}`).join("\n");
}

/**
 * Normalize a store domain: strips protocol/path, lowercases, and appends
 * `.myshopify.com` when a bare store handle is given.
 */
export function normalizeStoreDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/\/.*$/, "");
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

function parseEntry(entry: unknown, source: string, i: number): Account {
  if (!entry || typeof entry !== "object") {
    throw new Error(`${source}[${i}] is not an object`);
  }
  const e = entry as ParsedEntry;

  const rawDomain = e.storeDomain ?? e.domain ?? e.store ?? e.shop;
  const rawOrgId = e.organizationId ?? e.orgId;
  const accessToken = e.accessToken ?? e.token;

  let type = e.type?.trim().toLowerCase();
  if (!type) {
    if (rawDomain && rawOrgId === undefined) type = "store";
    else if (rawOrgId !== undefined && !rawDomain) type = "partner";
    else {
      throw new Error(
        `${source}[${i}] has ambiguous or missing type — set "type" to "store" or "partner"`
      );
    }
  }
  if (type !== "store" && type !== "partner") {
    throw new Error(`${source}[${i}] has invalid type "${type}" — must be "store" or "partner"`);
  }

  if (type === "store") {
    if (!rawDomain) {
      throw new Error(`${source}[${i}] (type "store") is missing storeDomain`);
    }
    const hasClientCreds = Boolean(e.clientId && e.clientSecret);
    if (!accessToken && !hasClientCreds) {
      throw new Error(
        `${source}[${i}] (type "store") needs accessToken, or clientId + clientSecret for the client-credentials grant`
      );
    }
    const name = (e.name ?? "default").trim().toLowerCase();
    return {
      name,
      type: "store",
      storeDomain: normalizeStoreDomain(rawDomain),
      accessToken,
      clientId: e.clientId,
      clientSecret: e.clientSecret,
      apiVersion: e.apiVersion?.trim() || DEFAULT_ADMIN_API_VERSION,
      storefrontAccessToken: e.storefrontAccessToken,
    };
  }

  if (!accessToken) {
    throw new Error(`${source}[${i}] is missing accessToken`);
  }

  if (rawOrgId === undefined || rawOrgId === "") {
    throw new Error(`${source}[${i}] (type "partner") is missing organizationId`);
  }
  const name = (e.name ?? "partner").trim().toLowerCase();
  return {
    name,
    type: "partner",
    organizationId: String(rawOrgId),
    accessToken,
    apiVersion: e.apiVersion?.trim() || DEFAULT_PARTNER_API_VERSION,
  };
}

function parseAccountsJson(raw: string, source: string): Map<string, Account> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${source} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${source} must be a JSON array of account objects`);
  }
  const out = new Map<string, Account>();
  for (const [i, entry] of parsed.entries()) {
    const acc = parseEntry(entry, source, i);
    if (out.has(acc.name)) {
      throw new Error(`${source} contains duplicate account name "${acc.name}"`);
    }
    out.set(acc.name, acc);
  }
  return out;
}

/**
 * Build the account map from supported configuration sources, merged in
 * this order (later sources override earlier ones for the same name):
 *
 *   1. `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ACCESS_TOKEN` → "default" store account
 *      (optional: `SHOPIFY_API_VERSION`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`)
 *   2. `SHOPIFY_PARTNER_ORGANIZATION_ID` + `SHOPIFY_PARTNER_ACCESS_TOKEN` →
 *      "partner" partner account (optional: `SHOPIFY_PARTNER_API_VERSION`)
 *   3. `SHOPIFY_ACCOUNTS_FILE` — path to a JSON file containing
 *      `[{name, type, storeDomain|organizationId, accessToken, ...}, ...]`
 *
 * Account names are lowercased throughout.
 */
function parseAccounts(): Map<string, Account> {
  const snapshot = envSnapshot();
  if (cachedAccounts && cachedSnapshot === snapshot) return cachedAccounts;

  const map = new Map<string, Account>();

  const envClientCreds = Boolean(
    process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET
  );
  if (
    process.env.SHOPIFY_STORE_DOMAIN &&
    (process.env.SHOPIFY_ACCESS_TOKEN || envClientCreds)
  ) {
    map.set("default", {
      name: "default",
      type: "store",
      storeDomain: normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN),
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN || undefined,
      clientId: process.env.SHOPIFY_CLIENT_ID || undefined,
      clientSecret: process.env.SHOPIFY_CLIENT_SECRET || undefined,
      apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_ADMIN_API_VERSION,
      storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || undefined,
    });
  }

  if (process.env.SHOPIFY_PARTNER_ORGANIZATION_ID && process.env.SHOPIFY_PARTNER_ACCESS_TOKEN) {
    map.set("partner", {
      name: "partner",
      type: "partner",
      organizationId: process.env.SHOPIFY_PARTNER_ORGANIZATION_ID.trim(),
      accessToken: process.env.SHOPIFY_PARTNER_ACCESS_TOKEN,
      apiVersion: process.env.SHOPIFY_PARTNER_API_VERSION?.trim() || DEFAULT_PARTNER_API_VERSION,
    });
  }

  const filePath = process.env.SHOPIFY_ACCOUNTS_FILE;
  if (filePath && filePath.trim()) {
    let raw: string;
    try {
      raw = readFileSync(filePath.trim(), "utf8");
    } catch (err) {
      throw new Error(
        `SHOPIFY_ACCOUNTS_FILE could not be read at "${filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    for (const [name, acc] of parseAccountsJson(raw, "SHOPIFY_ACCOUNTS_FILE")) {
      map.set(name, acc);
    }
  }

  cachedAccounts = map;
  cachedSnapshot = snapshot;
  return map;
}

function describeConfigured(accounts: Map<string, Account>): string {
  const parts = [...accounts.values()].map((a) => `${a.name} (${a.type})`);
  return parts.join(", ") || "(none)";
}

/**
 * Resolve an account by name, checked against the expected type. When name
 * is omitted: tries the canonical default name ("default" for store,
 * "partner" for partner), then falls back to the sole account of that type
 * if exactly one is configured.
 */
export function resolveAccount(name: string | undefined, expected: AccountType): Account {
  const accounts = parseAccounts();

  if (name && name.trim()) {
    const key = name.trim().toLowerCase();
    const acc = accounts.get(key);
    if (!acc) {
      throw new Error(
        `No Shopify account named "${name}". Configured accounts: ${describeConfigured(accounts)}`
      );
    }
    if (acc.type !== expected) {
      throw new Error(
        `Account "${name}" is a ${acc.type} account, but this tool requires a ${expected} account`
      );
    }
    return acc;
  }

  const canonical = expected === "store" ? "default" : "partner";
  const byName = accounts.get(canonical);
  if (byName && byName.type === expected) return byName;

  const ofType = [...accounts.values()].filter((a) => a.type === expected);
  if (ofType.length === 1) return ofType[0];
  if (ofType.length === 0) {
    throw new Error(
      expected === "store"
        ? "No Shopify store accounts configured. Set SHOPIFY_STORE_DOMAIN and " +
            "SHOPIFY_ACCESS_TOKEN, or add a store entry to the file referenced " +
            "by SHOPIFY_ACCOUNTS_FILE."
        : "No Shopify partner accounts configured. Set SHOPIFY_PARTNER_ORGANIZATION_ID " +
            "and SHOPIFY_PARTNER_ACCESS_TOKEN, or add a partner entry to the file " +
            "referenced by SHOPIFY_ACCOUNTS_FILE."
    );
  }
  throw new Error(
    `Multiple ${expected} accounts configured (${ofType.map((a) => a.name).join(", ")}); ` +
      `specify the "account" parameter to select one`
  );
}

/**
 * Returns metadata about configured accounts. Never includes tokens.
 */
export function listConfiguredAccounts(): Array<{
  name: string;
  type: AccountType;
  target: string;
  apiVersion: string;
  auth?: "token" | "client_credentials";
  hasStorefrontToken?: boolean;
}> {
  return [...parseAccounts().values()].map((a) =>
    a.type === "store"
      ? {
          name: a.name,
          type: a.type,
          target: a.storeDomain,
          apiVersion: a.apiVersion,
          auth: (a.accessToken ? "token" : "client_credentials") as "token" | "client_credentials",
          hasStorefrontToken: Boolean(a.storefrontAccessToken),
        }
      : {
          name: a.name,
          type: a.type,
          target: `organization ${a.organizationId}`,
          apiVersion: a.apiVersion,
        }
  );
}

/** Test-only: clear the parsed-accounts cache and minted-token cache. */
export function _resetAccountsCache(): void {
  cachedAccounts = null;
  cachedSnapshot = undefined;
  mintedTokens.clear();
}

interface MintedToken {
  token: string;
  expiresAt: number;
}

const mintedTokens = new Map<string, MintedToken>();

/** Safety margin before expiry at which a cached minted token is refreshed. */
const TOKEN_REFRESH_SLACK_MS = 5 * 60 * 1000;

/**
 * Resolve the Admin API token for a store account: static accessToken when
 * present, otherwise a token minted via the OAuth client-credentials grant
 * (Dev Dashboard apps; tokens expire after ~24h) and cached until shortly
 * before expiry.
 */
async function getStoreToken(acc: StoreAccount): Promise<string> {
  if (acc.accessToken) return acc.accessToken;
  if (!acc.clientId || !acc.clientSecret) {
    throw new Error(`Store account "${acc.name}" has no accessToken or client credentials`);
  }

  const cached = mintedTokens.get(acc.name);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const url = `https://${acc.storeDomain}/admin/oauth/access_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: acc.clientId,
      client_secret: acc.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(
      `Client-credentials token request for account "${acc.name}" failed with HTTP ${res.status}: ${detail || res.statusText}`
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error(
      `Client-credentials token request for account "${acc.name}" returned no access_token`
    );
  }
  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  mintedTokens.set(acc.name, {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(expiresInMs - TOKEN_REFRESH_SLACK_MS, 60_000),
  });
  return json.access_token;
}

interface GraphQLErrorEntry {
  message: string;
  [key: string]: unknown;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorEntry[];
}

async function graphqlRequest<T>(
  url: string,
  headers: Record<string, string>,
  query: string,
  variables: Record<string, unknown> | undefined,
  apiLabel: string
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new Error(`${apiLabel} HTTP ${res.status}: ${detail || res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(`${apiLabel} error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (json.data === undefined || json.data === null) {
    throw new Error(`${apiLabel} returned no data`);
  }
  return json.data;
}

/**
 * Execute a GraphQL request against the Admin API of a store account.
 */
export async function adminGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  account?: string
): Promise<T> {
  const acc = resolveAccount(account, "store") as StoreAccount;
  const token = await getStoreToken(acc);
  const url = `https://${acc.storeDomain}/admin/api/${acc.apiVersion}/graphql.json`;
  return graphqlRequest<T>(
    url,
    { "X-Shopify-Access-Token": token },
    query,
    variables,
    `Shopify Admin API (${acc.name})`
  );
}

/**
 * Execute a GraphQL request against the Partner API of a partner account.
 */
export async function partnerGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  account?: string
): Promise<T> {
  const acc = resolveAccount(account, "partner") as PartnerAccount;
  const url = `https://partners.shopify.com/${acc.organizationId}/api/${acc.apiVersion}/graphql.json`;
  return graphqlRequest<T>(
    url,
    { "X-Shopify-Access-Token": acc.accessToken },
    query,
    variables,
    `Shopify Partner API (${acc.name})`
  );
}

/**
 * Execute a GraphQL request against the Storefront API of a store account.
 * Requires `storefrontAccessToken` on the account.
 */
export async function storefrontGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  account?: string
): Promise<T> {
  const acc = resolveAccount(account, "store") as StoreAccount;
  if (!acc.storefrontAccessToken) {
    throw new Error(
      `Store account "${acc.name}" has no storefrontAccessToken configured. ` +
        `Add it to the account entry (or set SHOPIFY_STOREFRONT_ACCESS_TOKEN for the default account).`
    );
  }
  const url = `https://${acc.storeDomain}/api/${acc.apiVersion}/graphql.json`;
  return graphqlRequest<T>(
    url,
    { "X-Shopify-Storefront-Access-Token": acc.storefrontAccessToken },
    query,
    variables,
    `Shopify Storefront API (${acc.name})`
  );
}
