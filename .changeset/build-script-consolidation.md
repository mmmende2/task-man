---
---

Build/docs hygiene, no runtime change: drop `cli`'s `build:all`, an exact duplicate of the root `npm run build` (cli then web). `build:web` stays — `prepublishOnly` runs from `cli/`, where the root script isn't reachable. The cli README now points at the root script and notes that production runs from the droplet image, not a local build.
