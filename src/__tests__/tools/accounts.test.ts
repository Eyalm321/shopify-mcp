import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../client.js", () => ({
  listConfiguredAccounts: vi.fn().mockReturnValue([
    { name: "default", type: "store", target: "a.myshopify.com", apiVersion: "2026-04" },
  ]),
}));

import { listConfiguredAccounts } from "../../client.js";
import { accountsTools } from "../../tools/accounts.js";

const mockList = vi.mocked(listConfiguredAccounts);

describe("accountsTools", () => {
  beforeEach(() => {
    mockList.mockClear();
  });

  it("exports 1 tool", () => {
    expect(accountsTools).toHaveLength(1);
  });

  describe("shopify_list_accounts", () => {
    const tool = accountsTools.find((t) => t.name === "shopify_list_accounts")!;

    it("returns the configured accounts", async () => {
      const result = await tool.handler();
      expect(mockList).toHaveBeenCalled();
      expect(result).toEqual({
        accounts: [
          { name: "default", type: "store", target: "a.myshopify.com", apiVersion: "2026-04" },
        ],
      });
    });
  });
});
