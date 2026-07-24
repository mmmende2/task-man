---
"task-man": patch
---

Fix the runtime Docker image crash-looping on `serve` (502 via cloudflared). `npm ci --omit=dev` in the `prod-deps` stage drops the devDependency that was the only thing hoisting `chalk` to the root `node_modules`, leaving cli's `chalk@5` stranded in `cli/node_modules`. The runtime stage copied only the root tree, so `chalk` was absent and `import chalk` in `serve` threw `MODULE_NOT_FOUND` (exit 1 → restart loop). The runtime image now also carries the workspace's un-hoisted `cli/node_modules`. Landed via the npm-workspaces migration (v0.5.0); the image built green because the full-install build/CI stage hoists chalk fine — only the `--omit=dev` prune strands it.
