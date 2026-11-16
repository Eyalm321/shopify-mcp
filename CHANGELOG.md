# Changelog

## Unreleased

### Security
- `hono` 4.13.14 → 4.13.16 and `@hono/node-server` 1.19.17 → 2.1.6. Both come in through `@modelcontextprotocol/sdk`, whose declared range for `@hono/node-server` (`^1.19.9 || ^2.0.5`) includes 2.x, so the 1.19.17 override is removed. This clears the remaining moderate advisories in the SDK's HTTP transport (which this stdio server never loads anyway). `npm audit --omit=dev` now reports 0 vulnerabilities.

## 0.2.2 (2026-11-15)

No tool or API changes. Same Node support.

### Security and dependencies
- `@modelcontextprotocol/sdk` 1.29.0 → 1.32.2, `zod` 4.4.3 → 4.6.7.
- `npm audit`: 0 critical, 0 high. The remaining moderates are in the SDK's HTTP transport, which this stdio server never loads.
- Every dependency version is at least 14 days old (#1).

### Maintenance
- Dependabot with a 14-day cooldown (#1).
- npm publishing uses trusted publishing (OIDC). Workflow actions are pinned to commit SHAs (#2).

## Earlier versions

See the [GitHub releases](https://github.com/Eyalm321/shopify-mcp/releases).
