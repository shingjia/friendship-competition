---
name: auth-settings-design
description: Login system and settings panel design decisions added 2026-05-18
metadata:
  type: project
---

Login system and settings panel were added on 2026-05-18. All stored in localStorage.

- Default credentials: username `admin`, password `admin` (password is configurable and stored in `bm_settings`)
- Login state persisted via `bm_auth = '1'` in localStorage
- Settings key: `bm_settings` (JSON), merged with DEFAULT_SETTINGS on load so new fields are never missing

Settings panel controls:
- Nickname (display name, used for avatar initial)
- Password change (min 4 chars, confirmation required)
- Top logo icon (file upload → base64 data URL stored in settings; null = use default strongheart.png)
- Team title (supports "Team A VS Team B" format — VS badge auto-rendered)
- Hero subtitle text
- Hero background color (hex color picker + hex display; darkened version computed via hexDarken())

Avatar: initials-based (first char of nickname), yellow circle, top-right of hero header.
Gear icon: SVG inline, opens settings panel sliding in from right.

**Why:** No backend needed; organizer is single-user; localStorage is sufficient.
**How to apply:** If user asks to add more settings fields, add to DEFAULT_SETTINGS object and the settings panel HTML/JS. No server changes needed.

[[project-tech-stack]]
