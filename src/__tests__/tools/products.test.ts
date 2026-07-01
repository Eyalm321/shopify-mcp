import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { productTools } from "../../tools/products.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = productTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("productTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 6 tools", () => {
    expect(productTools).toHaveLength(6);
  });

  describe("shopify_list_products", () => {
    it("defaults first to 20 and passes query/after/account", async () => {
      await tool("shopify_list_products").handler({
        query: "status:active",
        after: "cur",
        account: "alpha",
      });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("products(first: $first");
      expect(variables).toEqual({ first: 20, query: "status:active", after: "cur" });
      expect(account).toBe("alpha");
    });

    it("respects an explicit first", async () => {
      await tool("shopify_list_products").handler({ first: 5 });
      expect(mockAdmin.mock.calls[0][1]).toEqual({
        first: 5,
        query: undefined,
        after: undefined,
      });
    });
  });

  describe("shopify_get_product", () => {
    it("expands numeric IDs to GIDs", async () => {
      await tool("shopify_get_product").handler({ id: "123" });
      expect(mockAdmin.mock.calls[0][1]).toEqual({ id: "gid://shopify/Product/123" });
    });

    it("passes full GIDs through", async () => {
      await tool("shopify_get_product").handler({ id: "gid://shopify/Product/9" });
      expect(mockAdmin.mock.calls[0][1]).toEqual({ id: "gid://shopify/Product/9" });
    });
  });

  describe("shopify_create_product", () => {
    it("builds a ProductCreateInput without the account field", async () => {
      await tool("shopify_create_product").handler({
        title: "Sunglasses",
        vendor: "Sunsations",
        tags: ["summer"],
        status: "DRAFT",
        account: "alpha",
      });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("productCreate(product: $product)");
      expect(variables).toEqual({
        product: { title: "Sunglasses", vendor: "Sunsations", tags: ["summer"], status: "DRAFT" },
      });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_update_product", () => {
    it("includes the expanded GID in the product input", async () => {
      await tool("shopify_update_product").handler({ id: "42", title: "New title" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("productUpdate(product: $product)");
      expect(variables).toEqual({
        product: { id: "gid://shopify/Product/42", title: "New title" },
      });
    });
  });

  describe("shopify_delete_product", () => {
    it("wraps the ID in a ProductDeleteInput", async () => {
      await tool("shopify_delete_product").handler({ id: "42" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("productDelete(input: $input)");
      expect(variables).toEqual({ input: { id: "gid://shopify/Product/42" } });
    });
  });

  describe("shopify_update_variants", () => {
    it("expands product and variant IDs", async () => {
      await tool("shopify_update_variants").handler({
        productId: "42",
        variants: [{ id: "7", price: "19.99" }],
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("productVariantsBulkUpdate");
      expect(variables).toEqual({
        productId: "gid://shopify/Product/42",
        variants: [{ id: "gid://shopify/ProductVariant/7", price: "19.99" }],
      });
    });
  });
});
