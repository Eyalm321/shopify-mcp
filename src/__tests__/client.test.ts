import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adminGraphql,
  partnerGraphql,
  storefrontGraphql,
  listConfiguredAccounts,
  normalizeStoreDomain,
  resolveAccount,
  _resetAccountsCache,
} from "../client.js";

// Strip any inherited SHOPIFY_* env vars so tests run in a clean baseline.
function clearShopifyEnv() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("SHOPIFY_")) vi.stubEnv(k, "");
  }
}

function okJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  };
}

describe("normalizeStoreDomain", () => {
  it("appends .myshopify.com to bare handles", () => {
    expect(normalizeStoreDomain("sunsations-dev")).toBe("sunsations-dev.myshopify.com");
  });

  it("keeps full domains unchanged", () => {
    expect(normalizeStoreDomain("sunsations-dev.myshopify.com")).toBe(
      "sunsations-dev.myshopify.com"
    );
  });

  it("strips protocol and path", () => {
    expect(normalizeStoreDomain("https://sunsations-dev.myshopify.com/admin")).toBe(
      "sunsations-dev.myshopify.com"
    );
  });

  it("lowercases", () => {
    expect(normalizeStoreDomain("SunSations-Dev")).toBe("sunsations-dev.myshopify.com");
  });
});

describe("adminGraphql", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    clearShopifyEnv();
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore.myshopify.com");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test");
    _resetAccountsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    _resetAccountsCache();
  });

  it("throws when no store credentials are configured", async () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "");
    _resetAccountsCache();
    await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
      /No Shopify store accounts configured/
    );
  });

  it("POSTs to the versioned admin endpoint with the access token header", async () => {
    mockFetch.mockResolvedValue(okJson({ data: { shop: { name: "Test" } } }));

    await adminGraphql("{ shop { name } }");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://teststore.myshopify.com/admin/api/2026-04/graphql.json",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "shpat_test",
        },
        body: JSON.stringify({ query: "{ shop { name } }", variables: {} }),
      })
    );
  });

  it("respects SHOPIFY_API_VERSION", async () => {
    vi.stubEnv("SHOPIFY_API_VERSION", "2026-07");
    _resetAccountsCache();
    mockFetch.mockResolvedValue(okJson({ data: { shop: { name: "Test" } } }));

    await adminGraphql("{ shop { name } }");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://teststore.myshopify.com/admin/api/2026-07/graphql.json"
    );
  });

  it("sends variables in the request body", async () => {
    mockFetch.mockResolvedValue(okJson({ data: { product: null } }));

    await adminGraphql("query($id: ID!) { product(id: $id) { id } }", {
      id: "gid://shopify/Product/1",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.variables).toEqual({ id: "gid://shopify/Product/1" });
  });

  it("returns the data payload on success", async () => {
    mockFetch.mockResolvedValue(okJson({ data: { shop: { name: "Test" } } }));

    const result = await adminGraphql("{ shop { name } }");
    expect(result).toEqual({ shop: { name: "Test" } });
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValue(
      okJson({ errors: [{ message: "Field 'bogus' doesn't exist" }] })
    );

    await expect(adminGraphql("{ bogus }")).rejects.toThrow(
      /Shopify Admin API \(default\) error: Field 'bogus' doesn't exist/
    );
  });

  it("throws on HTTP errors with status and body detail", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("[API] Invalid API key or access token"),
    });

    await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
      /Shopify Admin API \(default\) HTTP 401: \[API\] Invalid API key or access token/
    );
  });

  it("throws when the response has no data", async () => {
    mockFetch.mockResolvedValue(okJson({ data: null }));

    await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(/returned no data/);
  });

  describe("SHOPIFY_ACCOUNTS_FILE multi-account", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "shopify-mcp-test-"));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    function writeAccounts(entries: unknown): string {
      const file = join(tmp, "accounts.json");
      writeFileSync(file, JSON.stringify(entries));
      return file;
    }

    it("loads store accounts from a JSON file", async () => {
      const file = writeAccounts([
        {
          name: "alpha",
          type: "store",
          storeDomain: "alpha.myshopify.com",
          accessToken: "shpat_alpha",
        },
        {
          name: "beta",
          type: "store",
          storeDomain: "beta.myshopify.com",
          accessToken: "shpat_beta",
        },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      mockFetch.mockResolvedValue(okJson({ data: { shop: { name: "Alpha" } } }));

      await adminGraphql("{ shop { name } }", undefined, "alpha");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://alpha.myshopify.com/admin/api/2026-04/graphql.json"
      );
      expect(mockFetch.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe("shpat_alpha");
    });

    it("matches account names case-insensitively", async () => {
      const file = writeAccounts([
        { name: "AlphaStore", storeDomain: "alpha.myshopify.com", accessToken: "shpat_alpha" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      mockFetch.mockResolvedValue(okJson({ data: {} }));

      await adminGraphql("{ shop { name } }", undefined, "alphastore");

      expect(mockFetch.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe("shpat_alpha");
    });

    it("infers store type from storeDomain and accepts domain/token aliases", async () => {
      const file = writeAccounts([
        { name: "alias", domain: "alias-store", token: "shpat_alias" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      mockFetch.mockResolvedValue(okJson({ data: {} }));

      await adminGraphql("{ shop { name } }", undefined, "alias");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://alias-store.myshopify.com/admin/api/2026-04/graphql.json"
      );
      expect(mockFetch.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe("shpat_alias");
    });

    it("default account in the file overrides top-level env vars", async () => {
      const file = writeAccounts([
        {
          name: "default",
          storeDomain: "filedefault.myshopify.com",
          accessToken: "shpat_file_default",
        },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      mockFetch.mockResolvedValue(okJson({ data: {} }));

      await adminGraphql("{ shop { name } }");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://filedefault.myshopify.com/admin/api/2026-04/graphql.json"
      );
    });

    it("falls back to the sole store account when 'default' is absent", async () => {
      vi.stubEnv("SHOPIFY_STORE_DOMAIN", "");
      vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "");
      const file = writeAccounts([
        { name: "only", storeDomain: "only.myshopify.com", accessToken: "shpat_only" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      mockFetch.mockResolvedValue(okJson({ data: {} }));

      await adminGraphql("{ shop { name } }");

      expect(mockFetch.mock.calls[0][1].headers["X-Shopify-Access-Token"]).toBe("shpat_only");
    });

    it("throws when multiple store accounts exist and none is named default", async () => {
      vi.stubEnv("SHOPIFY_STORE_DOMAIN", "");
      vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "");
      const file = writeAccounts([
        { name: "a", storeDomain: "a.myshopify.com", accessToken: "x" },
        { name: "b", storeDomain: "b.myshopify.com", accessToken: "y" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();

      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /Multiple store accounts configured \(a, b\)/
      );
    });

    it("throws a helpful error when an unknown account is requested", async () => {
      const file = writeAccounts([
        { name: "alpha", storeDomain: "alpha.myshopify.com", accessToken: "x" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();

      await expect(adminGraphql("{ shop { name } }", undefined, "ghost")).rejects.toThrow(
        /No Shopify account named "ghost". Configured accounts: default \(store\), alpha \(store\)/
      );
    });

    it("throws when a partner account is passed to a store tool", async () => {
      const file = writeAccounts([
        { name: "porg", type: "partner", organizationId: 123, accessToken: "prtapi_x" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();

      await expect(adminGraphql("{ shop { name } }", undefined, "porg")).rejects.toThrow(
        /Account "porg" is a partner account, but this tool requires a store account/
      );
    });

    it("throws when the file path does not exist", async () => {
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", join(tmp, "does-not-exist.json"));
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /SHOPIFY_ACCOUNTS_FILE could not be read/
      );
    });

    it("throws when the file is not valid JSON", async () => {
      const file = join(tmp, "bad.json");
      writeFileSync(file, "not-json");
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /SHOPIFY_ACCOUNTS_FILE is not valid JSON/
      );
    });

    it("throws when the file is not a JSON array", async () => {
      const file = writeAccounts({ name: "alpha" });
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /SHOPIFY_ACCOUNTS_FILE must be a JSON array/
      );
    });

    it("throws when a store entry is missing accessToken", async () => {
      const file = writeAccounts([{ name: "alpha", storeDomain: "alpha.myshopify.com" }]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(/missing accessToken/);
    });

    it("throws when a store entry is missing storeDomain", async () => {
      const file = writeAccounts([{ name: "alpha", type: "store", accessToken: "x" }]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(/missing storeDomain/);
    });

    it("throws when an entry has neither storeDomain nor organizationId", async () => {
      const file = writeAccounts([{ name: "alpha", accessToken: "x" }]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /ambiguous or missing type/
      );
    });

    it("throws when the file has duplicate account names", async () => {
      const file = writeAccounts([
        { name: "alpha", storeDomain: "a.myshopify.com", accessToken: "x" },
        { name: "Alpha", storeDomain: "b.myshopify.com", accessToken: "y" },
      ]);
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();
      await expect(adminGraphql("{ shop { name } }")).rejects.toThrow(
        /duplicate account name "alpha"/
      );
    });
  });
});

describe("partnerGraphql", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    clearShopifyEnv();
    vi.stubEnv("SHOPIFY_PARTNER_ORGANIZATION_ID", "4242");
    vi.stubEnv("SHOPIFY_PARTNER_ACCESS_TOKEN", "prtapi_test");
    _resetAccountsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    _resetAccountsCache();
  });

  it("POSTs to the versioned partner endpoint with the access token header", async () => {
    mockFetch.mockResolvedValue(okJson({ data: { transactions: { edges: [] } } }));

    await partnerGraphql("{ transactions(first: 1) { edges { cursor } } }");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://partners.shopify.com/4242/api/2026-07/graphql.json",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": "prtapi_test",
        },
      })
    );
  });

  it("respects SHOPIFY_PARTNER_API_VERSION", async () => {
    vi.stubEnv("SHOPIFY_PARTNER_API_VERSION", "2026-04");
    _resetAccountsCache();
    mockFetch.mockResolvedValue(okJson({ data: {} }));

    await partnerGraphql("{ __typename }");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://partners.shopify.com/4242/api/2026-04/graphql.json"
    );
  });

  it("throws when no partner accounts are configured", async () => {
    vi.stubEnv("SHOPIFY_PARTNER_ORGANIZATION_ID", "");
    vi.stubEnv("SHOPIFY_PARTNER_ACCESS_TOKEN", "");
    _resetAccountsCache();
    await expect(partnerGraphql("{ __typename }")).rejects.toThrow(
      /No Shopify partner accounts configured/
    );
  });

  it("throws when a store account is passed to a partner tool", async () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore.myshopify.com");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test");
    _resetAccountsCache();
    await expect(partnerGraphql("{ __typename }", undefined, "default")).rejects.toThrow(
      /Account "default" is a store account, but this tool requires a partner account/
    );
  });

  it("throws on GraphQL errors with the partner label", async () => {
    mockFetch.mockResolvedValue(okJson({ errors: [{ message: "Throttled" }] }));

    await expect(partnerGraphql("{ __typename }")).rejects.toThrow(
      /Shopify Partner API \(partner\) error: Throttled/
    );
  });
});

describe("storefrontGraphql", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    clearShopifyEnv();
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore.myshopify.com");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_test");
    _resetAccountsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    _resetAccountsCache();
  });

  it("throws when the account has no storefront token", async () => {
    await expect(storefrontGraphql("{ shop { name } }")).rejects.toThrow(
      /has no storefrontAccessToken configured/
    );
  });

  it("POSTs to the storefront endpoint with the storefront token header", async () => {
    vi.stubEnv("SHOPIFY_STOREFRONT_ACCESS_TOKEN", "sf_test");
    _resetAccountsCache();
    mockFetch.mockResolvedValue(okJson({ data: { shop: { name: "Test" } } }));

    await storefrontGraphql("{ shop { name } }");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://teststore.myshopify.com/api/2026-04/graphql.json",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": "sf_test",
        },
      })
    );
  });
});

describe("resolveAccount", () => {
  beforeEach(() => {
    clearShopifyEnv();
    _resetAccountsCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetAccountsCache();
  });

  it("prefers the canonical 'partner' name when multiple partner accounts exist", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shopify-mcp-test-"));
    try {
      const file = join(tmp, "accounts.json");
      writeFileSync(
        file,
        JSON.stringify([
          { name: "partner", type: "partner", organizationId: 1, accessToken: "a" },
          { name: "other-org", type: "partner", organizationId: 2, accessToken: "b" },
        ])
      );
      vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
      _resetAccountsCache();

      const acc = resolveAccount(undefined, "partner");
      expect(acc.name).toBe("partner");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("listConfiguredAccounts", () => {
  let tmp: string;

  beforeEach(() => {
    clearShopifyEnv();
    _resetAccountsCache();
    tmp = mkdtempSync(join(tmpdir(), "shopify-mcp-test-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetAccountsCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty list when nothing is configured", () => {
    expect(listConfiguredAccounts()).toEqual([]);
  });

  it("includes the env-based default store and partner accounts", () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_x");
    vi.stubEnv("SHOPIFY_PARTNER_ORGANIZATION_ID", "77");
    vi.stubEnv("SHOPIFY_PARTNER_ACCESS_TOKEN", "prtapi_x");
    _resetAccountsCache();

    const accounts = listConfiguredAccounts();
    expect(accounts).toContainEqual({
      name: "default",
      type: "store",
      target: "teststore.myshopify.com",
      apiVersion: "2026-04",
      hasStorefrontToken: false,
    });
    expect(accounts).toContainEqual({
      name: "partner",
      type: "partner",
      target: "organization 77",
      apiVersion: "2026-07",
    });
  });

  it("never exposes tokens", () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_supersecret");
    _resetAccountsCache();

    const serialized = JSON.stringify(listConfiguredAccounts());
    expect(serialized).not.toContain("shpat_supersecret");
  });

  it("merges file accounts with env defaults (lowercased names)", () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "teststore");
    vi.stubEnv("SHOPIFY_ACCESS_TOKEN", "shpat_x");
    const file = join(tmp, "accounts.json");
    writeFileSync(
      file,
      JSON.stringify([
        { name: "Sunsations-Dev", storeDomain: "sunsations-dev", accessToken: "shpat_dev" },
        { name: "IolaPartners", type: "partner", organizationId: "99", accessToken: "prtapi_y" },
      ])
    );
    vi.stubEnv("SHOPIFY_ACCOUNTS_FILE", file);
    _resetAccountsCache();

    const names = listConfiguredAccounts().map((a) => a.name);
    expect(names).toContain("default");
    expect(names).toContain("sunsations-dev");
    expect(names).toContain("iolapartners");
  });
});
