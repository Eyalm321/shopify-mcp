#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { accountsTools } from "./tools/accounts.js";
import { shopTools } from "./tools/shop.js";
import { productTools } from "./tools/products.js";
import { orderTools } from "./tools/orders.js";
import { customerTools } from "./tools/customers.js";
import { inventoryTools } from "./tools/inventory.js";
import { collectionTools } from "./tools/collections.js";
import { graphqlTools } from "./tools/graphql.js";
import { partnerTools } from "./tools/partner.js";

const server = new McpServer({
  name: "shopify-multi-mcp",
  version: "0.1.0",
});

const allTools = [
  ...accountsTools,
  ...shopTools,
  ...productTools,
  ...orderTools,
  ...customerTools,
  ...inventoryTools,
  ...collectionTools,
  ...graphqlTools,
  ...partnerTools,
];

for (const tool of allTools) {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema.shape as any,
    async (args: any) => {
      try {
        const result = await tool.handler(args as any);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Shopify multi-account MCP server running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
