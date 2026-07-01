import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { collectionTools } from "../../tools/collections.js";

const mockAdmin = vi.mocked(adminGraphql);

describe("collectionTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 2 tools", () => {
    expect(collectionTools).toHaveLength(2);
  });

  describe("shopify_list_collections", () => {
    const tool = collectionTools.find((t) => t.name === "shopify_list_collections")!;

    it("defaults first to 20 and forwards account", async () => {
      await tool.handler({ account: "alpha" });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("collections(first: $first");
      expect(variables).toEqual({ first: 20, query: undefined, after: undefined });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_get_collection", () => {
    const tool = collectionTools.find((t) => t.name === "shopify_get_collection")!;

    it("expands numeric IDs and paginates products", async () => {
      await tool.handler({ id: "31", first: 10, after: "cur" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("collection(id: $id)");
      expect(variables).toEqual({
        id: "gid://shopify/Collection/31",
        first: 10,
        after: "cur",
      });
    });
  });
});
