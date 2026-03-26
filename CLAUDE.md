# CLAUDE.md

## Data safety

- **Never modify user data files without reading them first.** Always read and confirm contents before any in-place edit.
- **If a command produces unexpected results** (e.g., file suddenly empty), stop and tell the user immediately. Do not rationalize it away.
- **Use structure-aware tools for structured data.** Use `jq` for JSON, `yq` for YAML — never `sed` or `awk`. Write to a temp file first, then move:
  ```bash
  jq '<filter>' file.json > /tmp/file-fixed.json && mv /tmp/file-fixed.json file.json
  ```
- **Prefer the app's own API** (task-man store, MCP tools) over shell tools when modifying app data — it handles locking, validation, and atomic writes.
