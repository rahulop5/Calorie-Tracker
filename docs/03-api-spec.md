# API spec

Base path `/api/v1`. JSON in, JSON out, except file uploads which are `multipart/form-data`.
Interactive docs are generated from the Zod schemas and served at `/docs`.

**Status:** every endpoint below is **implemented and tested** — 27 documented paths, served at
`/docs`.

## Conventions

**Dates are `'YYYY-MM-DD'` strings.** Every date in this API — `entryDate`, `effectiveFrom`,
`measuredOn`, and the `from`/`to` filters — is a calendar date, not a timestamp. There is **no `tz`
parameter anywhere**, because a date has no instant to convert and so cannot be off by a day. The
client sends its own local date; the server never guesses what "today" means for a user.

No resource carries a `createdAt` or `updatedAt`, because nothing in the app reads one. See
`02-data-model.md` for the few timestamps that survive and why.

**Single resources** are returned directly. **Lists** use one envelope:

```json
{
  "data": [ { "...": "..." } ],
  "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7, "hasNext": true }
}
```

**Pagination** is on every list endpoint: `page` (default 1) and `pageSize` (default 20, max 100).
Offset-based, because the UI shows page numbers and the data volume here is small. Keyset
pagination is the documented scaling path, not built now.

**Errors** use one envelope, with `requestId` on every response so a user report maps to a log line:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "password", "message": "Too small: expected string to have >=8 characters" }],
    "requestId": "00587089-da80-44d4-85a3-5c699402cbde"
  }
}
```

| Code | HTTP | Raised when |
|---|---|---|
| `VALIDATION_ERROR` | 400 | body, query or params failed their schema |
| `UNAUTHORIZED` | 401 | missing, invalid or expired credentials |
| `FORBIDDEN` | 403 | authenticated but not allowed |
| `NOT_FOUND` | 404 | no such record, or no such route |
| `CONFLICT` | 409 | duplicate email, duplicate goal date |
| `PAYLOAD_TOO_LARGE` | 413 | upload over the per-route limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | wrong content type |
| `RATE_LIMITED` | 429 | over the request limit |
| `AI_PROVIDER_ERROR` | 502 | the model call failed or returned nonsense |
| `INTERNAL_ERROR` | 500 | anything unhandled; details are logged, never returned |

`details` carries the field path, so a form can highlight the offending input.

**Rate limits:** 120 requests/minute globally, 10/minute on login and register, 20/minute on the
AI and chat-send routes because each call costs money, and none on `/health`.

---

## Auth — implemented

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `email, password, name` | `201` `{ user, accessToken }` + refresh cookie |
| POST | `/auth/login` | `email, password` | `200` `{ user, accessToken }` + refresh cookie |
| POST | `/auth/refresh` | refresh cookie | `200` `{ accessToken }` + rotated cookie |
| POST | `/auth/logout` | refresh cookie | `204` |
| GET | `/auth/me` | — | `200` `user` |

Everything except these five and `/health` requires `Authorization: Bearer <accessToken>`.

**Two tokens, on purpose.** The access token is a 15-minute JWT sent in the `Authorization` header
and held in browser memory — never in `localStorage`, which is readable by any injected script. The
refresh token lives 30 days in a cookie that is `httpOnly`, `Secure` in production, and scoped to
`path=/api/v1/auth` so it is not attached to ordinary API calls.

**Refresh tokens rotate.** Each refresh revokes the old token and issues a new one in a single
transaction. If a revoked token is presented again — the signature of a stolen cookie — every
session for that user is revoked and they must log in again. Tested.

**Logout really logs out.** Tokens are stored server-side (hashed), so revoking one ends the
session immediately. Calling logout without a cookie returns `204`, so it is safe to retry.

**Passwords** are argon2id, minimum 8 characters. Emails are trimmed and lowercased, so one address
cannot register twice under different casing.

Login answers with the identical message for an unknown email and a wrong password. Note that
register returns `409` for an existing email, so email existence is discoverable by design — that
is the normal tradeoff for a usable signup form, and login is not what leaks it.

`user` never includes the password hash; responses are built by an explicit mapper rather than by
returning a database row.

---

## Goals — implemented

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/goals/current` | `on?` (date, default today) | goal active on that date, or `404` |
| GET | `/goals` | `page, pageSize` | version history, newest first |
| POST | `/goals` | `dailyCalories?, proteinG?, carbsG?, fatG?, targetWeightKg?, effectiveFrom?` | `201` new version |

Every field is optional because a change is a **new version merged onto the current one** — send
only what changed and the rest carries forward. The first goal must supply calories and all three
macros. `effectiveFrom` defaults to today; posting twice for one day replaces that day's version.

No delete: a version is history, and removing one would rewrite past goal-vs-actual comparisons.

## Weight — implemented

Gives `targetWeightKg` something to compare against.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/weights` | `from?, to?, page, pageSize` | history, newest first |
| GET | `/weights/latest` | — | most recent weight, or `404` |
| PUT | `/weights` | `weightKg, measuredOn?` | `200` stored weight |
| DELETE | `/weights/:id` | — | `204` |

`PUT`, not `POST`: one weight per day, so `measuredOn` (default today) makes the call idempotent.

## Entries — implemented

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/entries` | entry payload | `201` entry |
| POST | `/entries/bulk` | `{ entries: [...], source? }`, max 200 | `201` `{ created }` |
| GET | `/entries` | `from, to, mealType?, search?, sort?, page, pageSize` | paginated entries |
| GET | `/entries/:id` | — | entry |
| PATCH | `/entries/:id` | partial entry payload | entry |
| DELETE | `/entries/:id` | — | `204` (soft delete) |

```json
{
  "entryDate": "2026-09-13",
  "mealType": "BREAKFAST",
  "foodName": "Oats with milk",
  "quantity": 200,
  "unit": "G",
  "calories": 310,
  "proteinG": 12.5,
  "carbsG": 48,
  "fatG": 7.2,
  "micros": { "fiber_g": 6, "calcium_mg": 180 }
}
```

On `/entries/bulk`, `source` is `IMAGE` or `PDF` and defaults to `PDF`. It is per-batch rather
than per-entry, and narrowed to the two AI review screens that can produce a batch, so a client
still cannot pass off imported rows as hand-typed (`MANUAL`) or assistant-logged (`CHAT`) ones.

`sort` accepts `entryDate:asc|desc` and `calories:asc|desc`, default `entryDate:desc` then meal
order. Every sort ends on `id`, so paging is stable when values tie. `from`/`to` default to the
last 7 days and are inclusive at both ends. Unknown `micros` keys are rejected.

`source` is not accepted from the client; the server sets it from the code path.

Macros are **required**. A form with blank macros calls `POST /ai/estimate-nutrition` first and
submits the confirmed numbers here — see below.

`PATCH` sets exactly the fields it is given. Changing `quantity` does **not** rescale the stored
nutrition — a PATCH never touches a field the caller did not send, so if a portion changes the
caller sends the new numbers too. Omitting `micros` leaves the stored values alone.

`/entries/bulk` is the single write path for bulk data, used by the PDF review screen. It is **all
or nothing**: every row is validated before anything is written, and the insert is one transaction,
so a rejected import leaves nothing behind. The validation error names the offending row by index
(`entries.147.calories`), which is what the review table needs in order to highlight it.

## Reports — implemented

All report endpoints require `from` and `to`, inclusive, spanning at most **366 days** — micros are
summed in memory, so the window has to be bounded. Missing days appear in the series with zeroes so
charts have no gaps. Day-series endpoints are paginated over buckets, so the pagination contract
holds everywhere.

`groupBy=week` buckets are labelled by their **Monday** and clipped to the range. A week's target is
the **sum of the daily targets** for the days it covers, so a goal that changes mid-week still
compares correctly.

| Method | Path | Extra params | Returns |
|---|---|---|---|
| GET | `/reports/summary` | — | totals, daily averages, goal adherence |
| GET | `/reports/calories` | `groupBy=day\|week`, `page, pageSize` | calorie trend |
| GET | `/reports/macros` | `groupBy=day\|week`, `page, pageSize` | protein/carbs/fat per bucket, grams and percentages |
| GET | `/reports/micros` | — | summed micros, daily average, % of reference daily value |
| GET | `/reports/goal-vs-actual` | `groupBy=day\|week`, `page, pageSize` | goal, actual, difference per bucket |
| GET | `/reports/meal-breakdown` | — | totals by meal type |
| GET | `/reports/weight` | `page, pageSize` | weight series against the target active that day |

```json
{
  "bucket": "2026-09-13",
  "goalIsBaseline": false,
  "calories": { "goal": 2200, "actual": 1980, "diff": -220, "percent": 90 },
  "proteinG": { "goal": 150, "actual": 132, "diff": -18, "percent": 88 }
}
```

`goalIsBaseline` is `true` when the bucket predates every goal the user set, so the comparison is
against their earliest goal rather than one that was really active. The chart can then mark it
instead of presenting a guess as fact.

`/reports/micros` returns **every** known nutrient, including those with a zero total: "no vitamin D
all week" is exactly what that report exists to show. `/reports/meal-breakdown` likewise returns all
four meals, so the chart keeps a stable set of slices.

Per-day sums are computed by Postgres (`GROUP BY entry_date`). Folding days into weeks happens in
JavaScript over at most a year of rows, which avoids raw SQL for no measurable cost. Micronutrients
live in JSONB and are summed in memory for the same reason.

## AI — implemented

Three endpoints, all **stateless** — they return drafts and save nothing. The model proposes; the
user confirms; a normal entries endpoint writes.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/ai/extract-nutrition` | multipart: `image`, `mealType?`, `hint?` | drafts from a label or plate photo |
| POST | `/ai/estimate-nutrition` | `foodName, quantity, unit` | one draft estimated from the name |
| POST | `/ai/import-pdf` | multipart: `file` | candidate rows from a diary PDF |

**`/ai/extract-nutrition`** accepts JPEG, PNG or WebP up to 8 MB.

```json
{
  "kind": "LABEL",
  "drafts": [ { "foodName": "...", "quantity": 100, "unit": "G", "calories": 250, "...": "..." } ],
  "confidence": 0.86,
  "warnings": ["Serving size not visible; assumed 100 g."]
}
```

**`/ai/estimate-nutrition`** is the answer to blank macros. A user types "2 scrambled eggs" and a
quantity, leaves the numbers empty, and the API returns estimated calories, macros and micros with
a confidence score. The form fills in, the user checks it, and `POST /entries` saves it with
`source: AI_ESTIMATE`.

It is a separate call rather than magic inside `POST /entries`, for three reasons: creating an entry
stays fast and deterministic instead of waiting on a model, a provider outage cannot turn a valid
save into a `502`, and the user sees the numbers *before* they are stored, which is what confirming
means. The same code backs the chat assistant's `estimate_nutrition` tool.

**`/ai/import-pdf`** accepts a PDF up to 15 MB and returns candidates; nothing is stored.

```json
{
  "candidates": [
    { "row": 0, "valid": true,  "issues": [], "draft": { "entryDate": "2026-09-01", "...": "..." } },
    { "row": 1, "valid": false, "issues": ["mealType: unknown value 'brunch'"], "draft": { "...": "..." } }
  ]
}
```

The browser holds these, renders an editable review table with bad rows flagged, and posts the
corrected set to `POST /entries/bulk`. See `04-ai-design.md` for why there is no server-side job.

A row whose date could not be read comes back with `valid: false` and today's date filled in, so
the review table starts it **unselected** with the reason shown. A bad row is opt-in, never
silently imported and never silently dropped.

## Chat — implemented

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/chat/conversations` | `title?` | `201` conversation |
| GET | `/chat/conversations` | `page, pageSize` | paginated, most recent first |
| GET | `/chat/conversations/:id/messages` | `page, pageSize` | paginated, oldest first |
| POST | `/chat/conversations/:id/messages` | `content` | SSE stream |
| DELETE | `/chat/conversations/:id` | — | `204` (soft delete) |

The send endpoint streams Server-Sent Events:

| Event | Payload |
|---|---|
| `token` | `{ text }` |
| `tool_start` | `{ name, input }` |
| `tool_result` | `{ name, summary }` |
| `done` | `{ messageId }` |
| `error` | `{ code, message }` |

Tool events are surfaced deliberately: when the assistant logs a meal, the user should see it
happen and be able to undo it.

Because the reply is a stream, the response headers are already sent by the time a failure can
happen, so an error arrives as an `error` **event** rather than an HTTP status. The client shows it
inline and the stream closes cleanly.

Once a reply finishes, the web app refetches entries, goals, weight and reports, since the
assistant may have changed any of them.

## Health — implemented

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `200` `{ status: "ok", version, db: "up" }`, or `503` when the database is unreachable |

503 rather than 200-with-a-flag, so a load balancer takes a broken instance out of rotation.
