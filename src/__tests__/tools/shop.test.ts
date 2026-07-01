import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({ shop: { name: "Test" } }),
}));

import { adminGraphql } from "../../client.js";
import { shopTools } from "../../tools/shop.js";

const mockAdmin = vi.mocked(adminGraphql);

describe("shopTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 1 tool", () => {
    expect(shopTools).toHaveLength(1);
  });

  describe("shopify_get_shop", () => {
    const tool = shopTools.find((t) => t.name === "shopify_get_shop")!;

    it("queries the shop object", async () => {
      await tool.handler({});
      expect(mockAdmin).toHaveBeenCalledTimes(1);
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("shop {");
      expect(query).toContain("myshopifyDomain");
      expect(query).toContain("partnerDevelopment");
      expect(variables).toBeUndefined();
      expect(account).toBeUndefined();
    });

    it("forwards the account param", async () => {
      await tool.handler({ account: "sunsations-dev" });
      expect(mockAdmin.mock.calls[0][2]).toBe("sunsations-dev");
    });
  });
});
