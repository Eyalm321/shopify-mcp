import { z } from "zod";
import { listConfiguredAccounts } from "../client.js";

export const accountsTools = [
  {
    name: "shopify_list_accounts",
    description:
      "List all configured Shopify accounts (stores and partner organizations) with their name, type, target (store domain or organization), and API version. Tokens are never returned. Use these names as the 'account' parameter on other tools.",
    inputSchema: z.object({}),
    handler: async () => {
      return { accounts: listConfiguredAccounts() };
    },
  },
];
