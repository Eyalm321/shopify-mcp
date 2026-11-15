# Changelog

## 0.2.2 (unreleased)

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
