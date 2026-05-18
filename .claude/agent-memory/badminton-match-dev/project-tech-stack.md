---
name: project-tech-stack
description: Tech stack and architecture decisions for the friendship-competition badminton app
metadata:
  type: project
---

This is a Node.js + Express static web app. No frontend framework — plain HTML/CSS/JS.

- Server: `server.js` (Express, port 3000)
- Static frontend: `public/index.html`, `public/app.js`, `public/style.css`
- Data: flat text files under `data/` (players.txt, groups.txt, pairs.txt, matches.txt), pipe-delimited
- Auth & settings: 100% localStorage, no backend auth — `bm_auth` key (login state), `bm_settings` key (JSON config)

**Why:** Simple, self-contained, deployable anywhere (Docker included). No build step needed.
**How to apply:** Avoid proposing React/Vue/backend auth solutions — localStorage is intentional for simplicity.

[[auth-settings-design]]
