# API Surface Audit (2026-01-06)

## Next.js API Routes (`lawclick-next/src/app/api`)
- Count: 6

- `/api/auth/*`
- `/api/documents/:id/file`
- `/api/health`
- `/api/queue/process`
- `/api/realtime/signals`
- `/api/team/:id/vcard`

## Rust Prototype API Endpoints (`src/routes`)
- Count: 7

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/cases`
- `POST /api/v1/cases`
- `GET /api/v1/cases/:id`

## Overlap Check
- Next routes under `/api/v1`: 0

> Note: Rust prototype uses `/api/v1/*` while Next.js uses `/api/*`. Production deployment should choose a single backend surface to avoid operational confusion.
