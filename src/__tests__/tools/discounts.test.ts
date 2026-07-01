import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { discountTools } from "../../tools/discounts.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = discountTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("discountTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 4 tools", () => {
    expect(discountTools).toHaveLength(4);
  });

  describe("shopify_list_discounts", () => {
    it("queries discountNodes with type fragments", async () => {
      await tool("shopify_list_discounts").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("discountNodes(first: $first");
      expect(query).toContain("... on DiscountCodeBasic");
      expect(query).toContain("... on DiscountAutomaticBasic");
      expect(variables).toEqual({ first: 20, query: undefined, after: undefined });
    });
  });

  describe("shopify_create_discount_code", () => {
    it("converts human percentage (0-100) to Shopify fraction (0-1)", async () => {
      await tool("shopify_create_discount_code").handler({
        title: "Summer sale",
        code: "SUMMER20",
        percentage: 20,
        startsAt: "2026-07-01T00:00:00Z",
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("discountCodeBasicCreate");
      expect(variables).toEqual({
        basicCodeDiscount: {
          title: "Summer sale",
          code: "SUMMER20",
          startsAt: "2026-07-01T00:00:00Z",
          customerSelection: { all: true },
          customerGets: { value: { percentage: 0.2 }, items: { all: true } },
        },
      });
    });

    it("builds a fixed-amount discount", async () => {
      await tool("shopify_create_discount_code").handler({
        title: "Ten off",
        code: "TENOFF",
        amountOff: "10.00",
        startsAt: "2026-07-01T00:00:00Z",
        usageLimit: 100,
      });
      const variables = mockAdmin.mock.calls[0][1] as {
        basicCodeDiscount: Record<string, unknown>;
      };
      expect(variables.basicCodeDiscount.customerGets).toEqual({
        value: { discountAmount: { amount: "10.00", appliesOnEachItem: false } },
        items: { all: true },
      });
      expect(variables.basicCodeDiscount.usageLimit).toBe(100);
    });

    it("defaults startsAt to now", async () => {
      const before = Date.now();
      await tool("shopify_create_discount_code").handler({
        title: "x",
        code: "X",
        percentage: 10,
      });
      const variables = mockAdmin.mock.calls[0][1] as {
        basicCodeDiscount: { startsAt: string };
      };
      const ts = Date.parse(variables.basicCodeDiscount.startsAt);
      expect(ts).toBeGreaterThanOrEqual(before - 1000);
      expect(ts).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it("rejects both percentage and amountOff", async () => {
      await expect(
        tool("shopify_create_discount_code").handler({
          title: "x",
          code: "X",
          percentage: 10,
          amountOff: "5.00",
        })
      ).rejects.toThrow(/exactly one of percentage or amountOff/);
    });

    it("rejects neither percentage nor amountOff", async () => {
      await expect(
        tool("shopify_create_discount_code").handler({ title: "x", code: "X" })
      ).rejects.toThrow(/exactly one of percentage or amountOff/);
    });
  });

  describe("shopify_toggle_discount", () => {
    it("activates a code discount by GID", async () => {
      await tool("shopify_toggle_discount").handler({
        id: "gid://shopify/DiscountCodeNode/1",
        activate: true,
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("discountCodeActivate");
      expect(variables).toEqual({ id: "gid://shopify/DiscountCodeNode/1" });
    });

    it("deactivates an automatic discount detected from the GID", async () => {
      await tool("shopify_toggle_discount").handler({
        id: "gid://shopify/DiscountAutomaticNode/2",
        activate: false,
      });
      expect(mockAdmin.mock.calls[0][0]).toContain("discountAutomaticDeactivate");
    });

    it("uses the automatic flag for bare numeric IDs", async () => {
      await tool("shopify_toggle_discount").handler({
        id: "42",
        activate: true,
        automatic: true,
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("discountAutomaticActivate");
      expect(variables).toEqual({ id: "gid://shopify/DiscountAutomaticNode/42" });
    });

    it("defaults bare numeric IDs to code discounts", async () => {
      await tool("shopify_toggle_discount").handler({ id: "42", activate: false });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("discountCodeDeactivate");
      expect(variables).toEqual({ id: "gid://shopify/DiscountCodeNode/42" });
    });
  });

  describe("shopify_delete_discount", () => {
    it("deletes a code discount", async () => {
      await tool("shopify_delete_discount").handler({ id: "gid://shopify/DiscountCodeNode/1" });
      expect(mockAdmin.mock.calls[0][0]).toContain("discountCodeDelete");
    });

    it("deletes an automatic discount detected from the GID", async () => {
      await tool("shopify_delete_discount").handler({
        id: "gid://shopify/DiscountAutomaticNode/2",
      });
      expect(mockAdmin.mock.calls[0][0]).toContain("discountAutomaticDelete");
    });
  });
});
