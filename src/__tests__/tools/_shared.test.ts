import { describe, it, expect } from "vitest";
import { toGid } from "../../tools/_shared.js";

describe("toGid", () => {
  it("expands bare numeric IDs", () => {
    expect(toGid("Product", "123")).toBe("gid://shopify/Product/123");
  });

  it("passes full GIDs through unchanged", () => {
    expect(toGid("Product", "gid://shopify/Product/123")).toBe("gid://shopify/Product/123");
  });

  it("passes partner GIDs through unchanged", () => {
    expect(toGid("App", "gid://partners/App/123")).toBe("gid://partners/App/123");
  });

  it("trims whitespace", () => {
    expect(toGid("Order", " 456 ")).toBe("gid://shopify/Order/456");
  });
});
