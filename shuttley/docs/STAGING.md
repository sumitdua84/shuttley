# Shuttley — Staging / Dev / Production Safety

## Purpose

Before any major Shuttley UI, performance, PWA, or architecture changes, a safe staging/test instance must exist.

Do not apply Phase 1 premium-feel changes directly to production.

The purpose of this setup is to protect real Shuttley users, production data, authentication, PWA install behaviour, and existing working flows.

---

## Current Account Setup

Shuttley is separate from OjasDesk, Ojas Meta, TradePulse, and chanting.club.

Shuttley uses its own account ownership and infrastructure.

Primary Shuttley account:

```text
sumit@shuttley.club
```

---

## Local Development Location

As of 2026-06-19, the Shuttley codebase was migrated from Google Drive
(`Shared drives/Shuttley/App`) to a local path, matching how OjasDesk and
TradePulse are set up:

```text
C:\Users\sumit\Projects\Shuttley
```

**Why it was moved off Google Drive:**
- Running a live git repo + `node_modules` inside a cloud-sync folder risks file
  locking and partial-sync corruption (already observed once during this
  migration — a stray sync-cache mismatch briefly blocked deleting the old
  folder).
- Google Drive's virtual filesystem is slow for large file counts
  (`node_modules` alone was 91MB / thousands of small files), which made local
  dev noticeably slower than a native disk path.
- Keeps Shuttley consistent with every other project, all of which live under
  `C:\Users\sumit\Projects\`.

**What stayed on Google Drive:** non-code assets only — `Credentials/`,
`Logos/`, `Roadmaps/`, `Screenshots/`, fonts, and the
`Shuttley - Critical Files - DO NOT DELETE` folder. The `App/` folder
(git repo + source code) was removed from Drive entirely after the local
clone was verified (cloned, `npm install`, `npm run build` all confirmed
working).

**Repo structure note:** the GitHub repo root (`sumitdua84/shuttley`) is one
level above the actual Vite app — the app itself lives in a `shuttley/`
subfolder alongside the repo's `README.md` and `Vercel.json`. So the working
app directory for `npm run dev` etc. is:

```text
C:\Users\sumit\Projects\Shuttley\shuttley
```

Active branch: `develop` (tracks `origin/develop`).
