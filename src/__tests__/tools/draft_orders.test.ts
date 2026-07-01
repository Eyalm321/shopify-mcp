import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { draftOrderTools } from "../../tools/draft_orders.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = draftOrderTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("draftOrderTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 5 tools", () => {
    expect(draftOrderTools).toHaveLength(5);
  });

  describe("shopify_list_draft_orders", () => {
    it("defaults first to 20", async () => {
      await tool("shopify_list_draft_orders").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("draftOrders(first: $first");
      expect(variables).toEqual({ first: 20, query: undefined, after: undefined });
    });
  });

  describe("shopify_get_draft_order", () => {
    it("expands numeric IDs to DraftOrder GIDs", async () => {
      await tool("shopify_get_draft_order").handler({ id: "9" });
      expect(mockAdmin.mock.calls[0][1]).toEqual({ id: "gid://shopify/DraftOrder/9" });
    });
  });

  describe("shopify_create_draft_order", () => {
    it("builds variant line items with expanded GIDs and purchasingEntity", async () => {
      await tool("shopify_create_draft_order").handler({
        lineItems: [{ variantId: "7", quantity: 2 }],
        customerId: "88",
        email: "jane@example.com",
        tags: ["wholesale"],
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("draftOrderCreate(input: $input)");
      expect(variables).toEqual({
        input: {
          lineItems: [{ quantity: 2, variantId: "gid://shopify/ProductVariant/7" }],
          purchasingEntity: { customerId: "gid://shopify/Customer/88" },
          email: "jane@example.com",
          tags: ["wholesale"],
        },
      });
    });

    it("builds custom line items with title and price", async () => {
      await tool("shopify_create_draft_order").handler({
        lineItems: [{ title: "Setup fee", quantity: 1, originalUnitPrice: "50.00" }],
      });
      const variables = mockAdmin.mock.calls[0][1] as { input: { lineItems: unknown[] } };
      expect(variables.input.lineItems).toEqual([
        { quantity: 1, title: "Setup fee", originalUnitPrice: "50.00" },
      ]);
    });
  });

  describe("shopify_complete_draft_order", () => {
    it("expands the ID and forwards paymentPending", async () => {
      await tool("shopify_complete_draft_order").handler({ id: "9", paymentPending: true });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("draftOrderComplete(id: $id");
      expect(variables).toEqual({ id: "gid://shopify/DraftOrder/9", paymentPending: true });
    });
  });

  describe("shopify_delete_draft_order", () => {
    it("wraps the expanded ID in a DraftOrderDeleteInput", async () => {
      await tool("shopify_delete_draft_order").handler({ id: "9" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("draftOrderDelete(input: $input)");
      expect(variables).toEqual({ input: { id: "gid://shopify/DraftOrder/9" } });
    });
  });
});
