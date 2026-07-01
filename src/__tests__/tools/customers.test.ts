import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { customerTools } from "../../tools/customers.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = customerTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("customerTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 4 tools", () => {
    expect(customerTools).toHaveLength(4);
  });

  describe("shopify_list_customers", () => {
    it("defaults first to 20 and forwards account", async () => {
      await tool("shopify_list_customers").handler({ account: "alpha" });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("customers(first: $first");
      expect(variables).toEqual({ first: 20, query: undefined, after: undefined });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_get_customer", () => {
    it("expands numeric IDs to Customer GIDs", async () => {
      await tool("shopify_get_customer").handler({ id: "88" });
      expect(mockAdmin.mock.calls[0][1]).toEqual({ id: "gid://shopify/Customer/88" });
    });
  });

  describe("shopify_create_customer", () => {
    it("builds a CustomerInput without the account field", async () => {
      await tool("shopify_create_customer").handler({
        email: "jane@example.com",
        firstName: "Jane",
        account: "alpha",
      });
      const [query, variables, account] = mockAdmin.mock.calls[0];
      expect(query).toContain("customerCreate(input: $input)");
      expect(variables).toEqual({ input: { email: "jane@example.com", firstName: "Jane" } });
      expect(account).toBe("alpha");
    });
  });

  describe("shopify_update_customer", () => {
    it("includes the expanded GID in the input", async () => {
      await tool("shopify_update_customer").handler({ id: "88", note: "VIP" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("customerUpdate(input: $input)");
      expect(variables).toEqual({ input: { id: "gid://shopify/Customer/88", note: "VIP" } });
    });
  });
});
