import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { inventoryTools } from "../../tools/inventory.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = inventoryTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("inventoryTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 3 tools", () => {
    expect(inventoryTools).toHaveLength(3);
  });

  describe("shopify_list_locations", () => {
    it("defaults first to 20", async () => {
      await tool("shopify_list_locations").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("locations(first: $first)");
      expect(variables).toEqual({ first: 20 });
    });
  });

  describe("shopify_get_inventory_levels", () => {
    it("expands the location ID and paginates", async () => {
      await tool("shopify_get_inventory_levels").handler({
        locationId: "12",
        first: 50,
        after: "cur",
        account: "alpha",
      });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("inventoryLevels(first: $first");
      expect(variables).toEqual({
        locationId: "gid://shopify/Location/12",
        first: 50,
        after: "cur",
      });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_adjust_inventory", () => {
    it("builds an InventoryAdjustQuantitiesInput with expanded GIDs and defaults", async () => {
      await tool("shopify_adjust_inventory").handler({
        changes: [{ inventoryItemId: "1", locationId: "2", delta: -3 }],
      });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("inventoryAdjustQuantities(input: $input)");
      expect(variables).toEqual({
        input: {
          reason: "correction",
          name: "available",
          changes: [
            {
              inventoryItemId: "gid://shopify/InventoryItem/1",
              locationId: "gid://shopify/Location/2",
              delta: -3,
            },
          ],
        },
      });
    });

    it("respects an explicit reason", async () => {
      await tool("shopify_adjust_inventory").handler({
        reason: "received",
        changes: [{ inventoryItemId: "1", locationId: "2", delta: 10 }],
      });
      const variables = mockAdmin.mock.calls[0][1] as { input: { reason: string } };
      expect(variables.input.reason).toBe("received");
    });
  });
});
