import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
  storefrontGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql, storefrontGraphql } from "../../client.js";
import { graphqlTools } from "../../tools/graphql.js";

const mockAdmin = vi.mocked(adminGraphql);
const mockStorefront = vi.mocked(storefrontGraphql);

describe("graphqlTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
    mockStorefront.mockClear();
  });

  it("exports 2 tools", () => {
    expect(graphqlTools).toHaveLength(2);
  });

  describe("shopify_admin_graphql", () => {
    const tool = graphqlTools.find((t) => t.name === "shopify_admin_graphql")!;

    it("passes query, variables, and account through verbatim", async () => {
      await tool.handler({
        query: "{ shop { name } }",
        variables: { a: 1 },
        account: "alpha",
      });
      expect(mockAdmin).toHaveBeenCalledWith("{ shop { name } }", { a: 1 }, "alpha");
      expect(mockStorefront).not.toHaveBeenCalled();
    });
  });

  describe("shopify_storefront_graphql", () => {
    const tool = graphqlTools.find((t) => t.name === "shopify_storefront_graphql")!;

    it("routes to the storefront client", async () => {
      await tool.handler({ query: "{ products(first: 1) { nodes { title } } }" });
      expect(mockStorefront).toHaveBeenCalledWith(
        "{ products(first: 1) { nodes { title } } }",
        undefined,
        undefined
      );
      expect(mockAdmin).not.toHaveBeenCalled();
    });
  });
});
