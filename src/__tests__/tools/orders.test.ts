import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { orderTools } from "../../tools/orders.js";

const mockAdmin = vi.mocked(adminGraphql);

describe("orderTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 2 tools", () => {
    expect(orderTools).toHaveLength(2);
  });

  describe("shopify_list_orders", () => {
    const tool = orderTools.find((t) => t.name === "shopify_list_orders")!;

    it("defaults first to 20 and passes filters", async () => {
      await tool.handler({ query: "financial_status:paid", account: "alpha" });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("orders(first: $first");
      expect(variables).toEqual({
        first: 20,
        query: "financial_status:paid",
        after: undefined,
      });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_get_order", () => {
    const tool = orderTools.find((t) => t.name === "shopify_get_order")!;

    it("expands numeric IDs to Order GIDs", async () => {
      await tool.handler({ id: "555" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("order(id: $id)");
      expect(query).toContain("lineItems");
      expect(variables).toEqual({ id: "gid://shopify/Order/555" });
    });
  });
});
