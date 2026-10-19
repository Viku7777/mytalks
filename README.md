# MyTalks

Premium static website for private emotional support and relationship guidance.

**Domain:** [mytalk.in](https://mytalk.in)  
**Brand:** MyTalks  
**Primary tagline:** Someone to Talk. Someone to Understand.

**Stack:** HTML5, CSS3, Vanilla JavaScript (no frameworks)  
**Data:** Dummy JSON in `/data` — structured for a later Firebase swap

## Run locally

Partials and JSON are loaded via `fetch`, so open the site through a local server (not `file://`).

Use the project server (supports Firebase-style clean URLs like `/pages/find-advisor`):

```bash
cd safetalks
python3 serve.py
```

Then visit `http://127.0.0.1:3456`.

> `python3 -m http.server` does **not** resolve extensionless page URLs and will 404 on nav links.

## Firebase later

All reads go through `js/data-loader.js` (`MyTalksData.getAdvisors()`, etc.). Replace those functions with Firestore/Auth calls while keeping the same return shapes — page UIs should not need a redesign.

## Theme

Light/dark mode toggles with `data-theme` and persists in `localStorage` (`mytalks-theme`).
# mytalks
# mytalks
