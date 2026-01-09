# API Surface Audit (2026-01-01)

## Next.js API Routes (`lawclick-next/src/app/api`)
- Count: 4

- `/api/auth/*`
- `/api/documents/:id/file`
- `/api/queue/process`
- `/api/realtime/signals`

## Rust Prototype API Endpoints (`src/routes`)
- Count: 9

- `POST /api/v1/ai/analyze`
- `POST /api/v1/ai/chat`
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
