import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { metafieldTools } from "../../tools/metafields.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = metafieldTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("metafieldTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 3 tools", () => {
    expect(metafieldTools).toHaveLength(3);
  });

  describe("shopify_get_metafields", () => {
    it("queries via node() with owner GID and namespace filter", async () => {
      await tool("shopify_get_metafields").handler({
        ownerId: "gid://shopify/Product/123",
        namespace: "custom",
        account: "alpha",
      });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("... on HasMetafields");
      expect(variables).toEqual({
        ownerId: "gid://shopify/Product/123",
        first: 20,
        after: undefined,
        namespace: "custom",
      });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_set_metafields", () => {
    it("passes MetafieldsSetInput entries through", async () => {
      const metafields = [
        {
          ownerId: "gid://shopify/Product/123",
          namespace: "custom",
          key: "material",
          value: "cotton",
          type: "single_line_text_field",
        },
      ];
      await tool("shopify_set_metafields").handler({ metafields });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("metafieldsSet(metafields: $metafields)");
      expect(variables).toEqual({ metafields });
    });
  });

  describe("shopify_delete_metafields", () => {
    it("passes MetafieldIdentifierInput entries through", async () => {
      const metafields = [
        { ownerId: "gid://shopify/Product/123", namespace: "custom", key: "material" },
      ];
      await tool("shopify_delete_metafields").handler({ metafields });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("metafieldsDelete(metafields: $metafields)");
      expect(variables).toEqual({ metafields });
    });
  });
});
