import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  adminGraphql: vi.fn().mockResolvedValue({}),
}));

import { adminGraphql } from "../../client.js";
import { bulkTools } from "../../tools/bulk.js";

const mockAdmin = vi.mocked(adminGraphql);

function tool(name: string) {
  const t = bulkTools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

describe("bulkTools", () => {
  beforeEach(() => {
    mockAdmin.mockClear();
  });

  it("exports 3 tools", () => {
    expect(bulkTools).toHaveLength(3);
  });

  describe("shopify_run_bulk_query", () => {
    it("passes the bulk query as a string variable", async () => {
      const bulkQuery = "{ products { edges { node { id title } } } }";
      await tool("shopify_run_bulk_query").handler({ query: bulkQuery });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("bulkOperationRunQuery(query: $query)");
      expect(variables).toEqual({ query: bulkQuery });
    });
  });

  describe("shopify_get_bulk_operation", () => {
    it("queries currentBulkOperation when no id is given", async () => {
      await tool("shopify_get_bulk_operation").handler({});
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("currentBulkOperation");
      expect(variables).toBeUndefined();
    });

    it("queries node() with the expanded GID when id is given", async () => {
      await tool("shopify_get_bulk_operation").handler({ id: "9" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("... on BulkOperation");
      expect(variables).toEqual({ id: "gid://shopify/BulkOperation/9" });
    });
  });

  describe("shopify_cancel_bulk_operation", () => {
    it("cancels by expanded GID", async () => {
      await tool("shopify_cancel_bulk_operation").handler({ id: "9" });
      const [query, variables] = mockAdmin.mock.calls[0];
      expect(query).toContain("bulkOperationCancel(id: $id)");
      expect(variables).toEqual({ id: "gid://shopify/BulkOperation/9" });
    });
  });
});
