import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  partnerGraphql: vi.fn().mockResolvedValue({}),
}));

import { partnerGraphql } from "../../client.js";
import { partnerTools } from "../../tools/partner.js";

const mockPartner = vi.mocked(partnerGraphql);

function tool(name: string) {
  const t = partnerTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("partnerTools", () => {
  beforeEach(() => {
    mockPartner.mockClear();
  });

  it("exports 3 tools", () => {
    expect(partnerTools).toHaveLength(3);
  });

  describe("shopify_partner_graphql", () => {
    it("passes query, variables, and account through verbatim", async () => {
      await tool("shopify_partner_graphql").handler({
        query: "{ transactions(first: 1) { edges { cursor } } }",
        variables: { x: true },
        account: "iola-partners",
      });
      expect(mockPartner).toHaveBeenCalledWith(
        "{ transactions(first: 1) { edges { cursor } } }",
        { x: true },
        "iola-partners"
      );
    });
  });

  describe("shopify_partner_transactions", () => {
    it("defaults first to 20 and passes date filters", async () => {
      await tool("shopify_partner_transactions").handler({
        createdAtMin: "2026-01-01T00:00:00Z",
        account: "iola-partners",
      });
      const [query, variables, account] = mockPartner.mock.calls[0];
      expect(query).toContain("transactions(first: $first");
      expect(query).toContain("... on AppSale");
      expect(variables).toEqual({
        first: 20,
        after: undefined,
        createdAtMin: "2026-01-01T00:00:00Z",
        createdAtMax: undefined,
      });
      expect(account).toBe("iola-partners");
    });
  });

  describe("shopify_partner_app_events", () => {
    it("passes the app GID and event filters", async () => {
      await tool("shopify_partner_app_events").handler({
        appId: "gid://partners/App/777",
        types: ["RELATIONSHIP_INSTALLED"],
        first: 50,
      });
      const [query, variables] = mockPartner.mock.calls[0];
      expect(query).toContain("app(id: $id)");
      expect(query).toContain("events(first: $first");
      expect(variables).toEqual({
        id: "gid://partners/App/777",
        first: 50,
        after: undefined,
        types: ["RELATIONSHIP_INSTALLED"],
        shopId: undefined,
        occurredAtMin: undefined,
        occurredAtMax: undefined,
      });
    });
  });
});
