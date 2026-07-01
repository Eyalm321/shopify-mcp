import { z } from "zod";

/**
 * Optional `account` field added to every authenticated tool. Selects which
 * account from the file referenced by `SHOPIFY_ACCOUNTS_FILE` (or the env
 * defaults) to use. Store tools default to the "default" store account;
 * partner tools default to the "partner" account. When only one account of
 * the required type is configured, it is used automatically.
 */
export const accountField = z
  .string()
  .optional()
  .describe(
    "Optional account name selecting which configured Shopify account to use " +
      "(from SHOPIFY_ACCOUNTS_FILE or env defaults). Matching is case-insensitive. " +
      "Omit to use the default account of the required type."
  );

export const firstField = z
  .number()
  .int()
  .min(1)
  .max(250)
  .optional()
  .describe("Number of items to return (default 20, max 250).");

export const afterField = z
  .string()
  .optional()
  .describe("Pagination cursor — pass the endCursor (or last edge cursor) from a previous page.");

/**
 * Expand a bare numeric ID into a Shopify GID. Full `gid://` IDs pass
 * through unchanged.
 */
export function toGid(kind: string, id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("gid://")) return trimmed;
  return `gid://shopify/${kind}/${trimmed}`;
}
