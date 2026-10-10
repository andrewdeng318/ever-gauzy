# Ever Gauzy on Vercel (webapp) + Hostinger (API)

Deployment of this fork for evaluation (ZCZ-262). Demo seed data only; do not enter real business data.

| Part | Where | URL |
| --- | --- | --- |
| Angular webapp (static) | Vercel project `ever-gauzy` (team `andrewdeng318s-projects`) | https://ever-gauzy-black.vercel.app |
| NestJS API | Hostinger VPS `srv2041209`, Docker project `gauzy-api`, behind Traefik (Let's Encrypt) | https://gauzy-api.srv2041209.hstgr.cloud/api/health |
| PostgreSQL 17 | Same Docker project, internal network only, volume `gauzy-api_db_data` | not exposed |

Version: upstream release `v111.48.2` (commit `5b3f778e1d`). Images are pinned by digest in
`compose.api.yml`; the webapp uses the static files of
`ghcr.io/ever-co/gauzy-webapp@sha256:e627292299b004648eee0d98ea6c0a98ce277c4427023c7a3ed18268a653e255`.

## Why the API is not on Vercel

The API is a long-running NestJS server with TypeORM migrations, demo seeding, schedulers and local
file storage, and needs PostgreSQL. It does not fit Vercel Functions. The browser calls the API
directly (`API_BASE_URL`), and the API only allows the Vercel origin (`ALLOWED_ORIGINS`).

## Why the webapp is not built on Vercel

Building the Angular app from source needs the whole Nx monorepo install and a large Node heap,
which is slow and memory-bound on Vercel's standard build machine. The upstream image already
contains the production build for the same commit, so it is reused and only the runtime
placeholders are filled in, exactly like `.deploy/webapp/entrypoint.prod.sh`.

## Files

- `compose.api.yml`: Hostinger Docker project (API + PostgreSQL, Traefik labels).
- `api.env.template`: API overrides appended to `.env.demo.compose`. `<generated>` values are
  created at deploy time and kept only in the VPS project `.env`.
- `webapp.env`: public webapp settings (no secrets).
- `prepare-webapp.mjs`: converts the image's `/srv/gauzy` into a Vercel Build Output directory.

## Deploy the API

Create or update the Hostinger Docker project `gauzy-api` with `compose.api.yml` and an
environment built from `.env.demo.compose` plus `api.env.template` (Hostinger API:
`POST /api/vps/v1/virtual-machines/2041209/docker`, `project_name`, `content`, `environment`).
The environment field is limited to 8192 characters, so comment lines, empty values,
`FEATURE_*=true` (the default), `MCP_*` and `DESKTOP_*` keys are dropped.

## Deploy the webapp

```sh
# 1. Extract /srv/gauzy from the pinned gauzy-webapp image into ./dist (any OCI tool).
# 2. Build the Vercel output.
node .deploy/vercel-hostinger/prepare-webapp.mjs ./dist .deploy/webapp/replacements.sed \
  ./out/.vercel/output .env.demo.compose .deploy/vercel-hostinger/webapp.env
# 3. Deploy (with .vercel/project.json pointing at the ever-gauzy project).
cd out && vercel deploy --prebuilt --prod
```

## Login

Super admin `admin@ever.co`. The password is `DEMO_SUPER_ADMIN_PASSWORD` in the `gauzy-api`
project environment on the VPS (hPanel > Docker Manager > gauzy-api, or the Hostinger API).
The login page pre-fills upstream demo passwords; they do not work here.

## Limitations

- Demo data (`DEMO=true`); no email (SMTP not configured), no Redis/worker queues.
- Public internet exposure; protected only by Gauzy authentication.
- API hostname depends on the VPS hostname `srv2041209`.
- Single VPS shared with Paperclip; no backups or monitoring for this database.

## Cleanup

- Webapp: delete Vercel project `ever-gauzy`.
- API: Hostinger API `DELETE /api/vps/v1/virtual-machines/2041209/docker/gauzy-api/down` (or hPanel),
  then remove the `gauzy-api_*` volumes. This deletes the demo database.
