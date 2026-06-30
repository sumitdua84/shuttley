# Shuttley - V1 Production Release Closeout Handover

Date: 2026-06-30
Branch at closeout: main
Current production commit: c530631 - docs: close V1 production release before V2
App-code state (last functional change before this docs closeout commit): a56d509 - fix: add Google Play app signing key to assetlinks.json
Production domain: https://www.shuttley.club
Staging domain: https://dev.shuttley.club

## Summary

V1 app-feel upgrade is live in production. The release was promoted from develop to main after staging verification on dev.shuttley.club. No production Supabase SQL, schema migration, RLS change, or data migration was run as part of the release.

V1 can remain in production while V2 planning and implementation begins separately.

## Release path completed

- Feature branch `feature/shuttley-app-feel-upgrade` merged to `develop` via PR #2.
- Post-merge docs committed at `a85774e`.
- Production compatibility fix committed at `681cf8a` for `matches.type` vs `match.match_type` stats handling.
- `main` was fast-forwarded to `681cf8a` and deployed to production.
- Follow-up production hotfixes were applied directly on `main` after release.

## Current production commits after V1 release

- `681cf8a` - fix: support production match type column in stats
- `2b7fad1` - feat: replace Start Session poll button with View Attendance + Start Session
- `8a6e5cd` - feat: rank players by win% with 10-match minimum threshold
- `505d91c` - fix: reorder GroupNav tabs to Home, Chat, Session, Stats, More
- `2cfbc6b` - fix: separate Sessions card into per-group cards for visual clarity
- `a56d509` - fix: add Google Play app signing key to assetlinks.json
- `c530631` - docs: close V1 production release before V2 (docs-only, no app code change)

## Verification completed

- Local production build passed before production promotion.
- `dev.shuttley.club` staging verified over HTTPS.
- Staging bundle verified against dev Supabase (`ecdibuhrgdmsdvovmlvl`).
- Production deployment completed on Vercel.
- `shuttley.club` redirects to `www.shuttley.club` and returns HTTP 200.
- Production bundle verified against production Supabase (`wuvwvrgxbfcyhqsyoswd`).
- Production service worker and manifest smoke checks passed.
- User verified production Matches/Stats after compatibility fix.
- User verified Android browser-toolbar issue fixed after assetlinks update.

## Production Supabase status

Production Supabase was not intentionally modified by this release session.

A read-only compatibility check showed production `matches` uses `type`, while the new stats UI had been reading `match_type`. This was fixed frontend-only by supporting both `match.match_type || match.type || 'doubles'`.

No production SQL was run for the release.

## Known remaining items

### Push notifications

A push-notification investigation found Shuttley has both Web Push and native iOS APNs paths:

- Web/PWA tokens: `push_subscriptions`
- Native iOS tokens: `apns_tokens`
- Delivery endpoint: `api/send-push.js`

At least one iOS user is receiving notifications, so global APNs production settings are likely functional. A non-receiving iOS device is currently suspected to be device/account/token state rather than a global production outage.

If needed later, check whether the affected user has a row in `apns_tokens`, then consider small code hardening around Notification API guards and APNs dead-token cleanup.

### V2

V2 has not started in this session. Recommended V2 start point is a fresh branch from current `main` after this closeout is committed.

## Recommended next session prompt

Shuttley V2 planning session.

Current production state:
- V1 app-feel is live in production.
- Current production branch: `main`.
- Current production commit: `c530631` (docs closeout; app-code state `a56d509`).
- Production domain: `https://www.shuttley.club`.
- Staging domain: `https://dev.shuttley.club`.
- Production Supabase: `wuvwvrgxbfcyhqsyoswd`.
- Dev Supabase: `ecdibuhrgdmsdvovmlvl`.
- No production SQL/schema migration was run for V1 release.

Task:
Start V2 planning from current production state. Do not change production. Do not run SQL. First read PROJECT.md, ROADMAP.md, CHANGELOG.md, docs/STAGING.md, and this handover file. Then propose the V2 branch strategy, architecture review steps, and first safe planning tasks.