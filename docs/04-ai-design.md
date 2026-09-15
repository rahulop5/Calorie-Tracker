# AI design

Four features need a model: photo extraction, nutrition estimation, PDF import, and the chat
assistant.

## Which model, and what it costs

Cost was the deciding factor, so the model is chosen **per task** rather than once for the app.
The provider port makes this a config change, not a code change.

Current Claude prices, per million tokens:

| Model | Input | Output | Context |
|---|---|---|---|
| Claude Haiku 4.5 | $1 | $5 | 200K |
| Claude Sonnet 5 | $2 | $10 | 1M |
| Claude Opus 5 | $5 | $25 | 1M |

**Recommendation:**

| Task | Model | Why |
|---|---|---|
| Label / plate photo | `claude-haiku-4-5` | Reading printed numbers into a fixed schema. Cheapest tier is enough, and the output is schema-constrained anyway. |
| Estimate from a name | `claude-haiku-4-5` | Short text in, small JSON out. The least demanding call in the app. |
| PDF diary parse | `claude-haiku-4-5` | Table reading, also schema-constrained, and every row is validated by our code afterwards. |
| Chat assistant | `claude-sonnet-5` | Multi-step tool calling: pick the right tool, fill its arguments from vague language, chain calls. This is where a cheap model shows its limits, and mistakes here are user-visible. |

**What actually shipped: Haiku for all four,** pinned to `claude-haiku-4-5-20251001`. Cost was the
deciding factor, and in testing Haiku picks the right tool and fills its arguments correctly for
the kinds of request this app gets. The reasoning above still stands if chat quality proves
short — `AI_MODEL_CHAT` is a separate variable precisely so that is a config change, not a code
change. The id is dated rather than an alias so a moving alias cannot change behaviour or cost
without a deploy.

What a single call costs, roughly:

| Call | Tokens (in / out) | Cost |
|---|---|---|
| Photo extraction | 2,000 / 500 | ~$0.005 |
| Estimate from a name | 300 / 300 | ~$0.002 |
| PDF with 20 rows | 6,000 / 3,000 | ~$0.02 |
| One chat turn with tools | 10,000 / 800 | ~$0.03 |

Building and demoing the whole project lands around **$10**. Using Haiku for chat too brings it to
about **$6**, and putting Opus on chat would push it past $25 — which is what the split avoids.

Two things that reduce the chat bill further, both worth doing when chat is built:

- **Prompt caching.** The system prompt and the tool definitions are byte-identical on every turn,
  so caching that prefix avoids paying full input price for it repeatedly.
- **History trimming.** `chat_messages.token_count` is stored precisely so old turns can be dropped
  against a budget with a `SUM` rather than re-tokenising the conversation.

Models are set by `AI_MODEL_EXTRACTION` and `AI_MODEL_CHAT`, so trying Haiku for chat and measuring
is a one-line change.

## The provider port

No module outside `ai/provider` knows which vendor we use:

```
LlmProvider
  extractNutrition(image, options)   -> NutritionDraft[]
  estimateNutrition(food, options)   -> NutritionDraft
  parseDiary(pdf, options)           -> DiaryCandidate[]
  chat(messages, tools, options)     -> AsyncIterable<ChatEvent>
```

Adapters live in `ai/provider/claude.ts` and `ai/provider/stub.ts`; `ai/provider/index.ts` picks
one from `LLM_PROVIDER`. The vendor is the least durable part of this system and the most likely to
need changing — price, rate limits, an outage during a demo — so keeping it behind a port means
that change never reaches the services.

`stub` is the default. It answers from fixed rules, needs no credentials, and keeps the app runnable
and demoable without a key. Switch to `claude` and the SDK resolves credentials from the
environment as usual.

A Gemini adapter is a documented extension point rather than code: it would be one new file
implementing the same four methods. Writing one now, with no way to exercise it, would be
speculative. Its tradeoffs if it is ever wanted: low free-tier rate limits, no SLA, and free-tier
inputs may be used to improve Google's models. Gemini 1.5 Flash specifically is deprecated and is
not a target.

## What the model is allowed to do

There are two different safety models here, and conflating them is how this goes wrong.

**Extraction and import are proposal-only.** Photo extraction, nutrition estimation and PDF parsing
never touch the database. Each endpoint is a pure function: upload or text in, draft out, nothing
persisted. A human confirms, and the write goes through the normal entries service with normal
validation. That is why a hallucinated 9,000-calorie banana lands in a review table rather than in
someone's history.

**The chat assistant does cause writes** — that is the point of it, since the requirement is that a
user can do everything through conversation. `log_food_entry`, `update_food_entry`,
`delete_food_entry`, `set_goal` and `record_weight` all mutate state. What keeps that safe is not a
ban on writing; it is four constraints:

1. **Every write goes through the same service the REST route uses.** A tool cannot reach a DAO, so
   it cannot skip a validation rule or a user scope. The Zod schema and the service are the same
   ones a manual entry passes through.
2. **The user id comes from the access token, never from a tool argument.** The model can ask for
   another user's data; it cannot get it.
3. **Numbers are confirmed before they are stored.** `estimate_nutrition` is a separate read-only
   tool from `log_food_entry`, so the assistant proposes values, shows them, and logs only once the
   user agrees. It cannot invent data and save it in one step.
4. **Every write is visible and reversible.** Tool calls stream to the UI as `tool_start` /
   `tool_result` events, entries are soft-deleted, and goals are versioned rather than overwritten,
   so nothing a tool does is silent or final.

In short: for images and PDFs the model only ever proposes. In chat it acts, but only through
validated services, on its own user's data, with the numbers confirmed first and every action shown
and undoable.

## 1. Photo extraction

A product nutrition label or a plate of food. One call, no agent loop.

- The prompt asks the model to classify `LABEL` or `PLATE` first, then extract.
- Output is constrained to our draft schema by the provider's structured-output feature, so we get
  valid JSON instead of parsing prose.
- Labels: read the printed values and the serving size, then scale to the stated quantity.
- Plates: identify each visible item, estimate its portion, return one draft per item.
- The model must report `confidence` and put every assumption in `warnings` — serving size guessed,
  label partly obscured, portion estimated by eye.

Checks our code runs afterwards, not the prompt:

- Reject negative values, or calories above the per-entry limit in `packages/shared/constants`.
- Compare macros against calories with `macroCalorieGap`. Over ~25% raises a warning rather than
  rejecting, because printed labels legitimately round.
- Strip any `micros` key not in the registry.

A plate usually produces several drafts. One can be sent into the entry form to be edited before
saving; ticking several sends them to `POST /entries/bulk` with `source: IMAGE`, which is the same
all-or-nothing write path the PDF review screen uses.

The draft lands in the normal entry form, pre-filled and fully editable.

### Two schema constraints the Messages API imposes

Both were found by running against the real API, and both shape the schemas in
`packages/shared`.

**A schema may not carry more than 24 optional properties.** There are 25 micronutrients, so a
`z.strictObject` of all of them is rejected outright with `invalid_request_error`. `microsSchema`
is therefore a `z.partialRecord` keyed by the nutrient enum: it compiles to `propertyNames` plus
`additionalProperties`, which has no optional-property count at all, while validating exactly as
before — an unknown key is still rejected, so the model cannot invent `vitaminC`.

It has to be `partialRecord` and not `record`. A plain `z.record` over an enum compiles to a JSON
Schema that lists all 25 keys as `required`, and the model reads that literally: asked to log a
glass of water it returned all 25 micronutrients as fabricated zeros, at roughly 18× the output
tokens. `partialRecord` emits no `required` list.

**Strict tool use rejects `minimum` and `maximum` on numbers.** Our schemas carry bounds on every
number, so `strict: true` would mean stripping the very constraints we want the model to read.
Tools are therefore declared without it. What makes that safe is that `createToolset` re-validates
every argument against the same Zod schema before any service is called, and returns the error to
the model as a tool result it can correct, rather than throwing.

## 2. Estimating missing nutrition

A user knows they ate "2 scrambled eggs" but not the macros. Rejecting that with a validation error
is a bad trade when a model can fill it in.

`POST /ai/estimate-nutrition` takes the food name, quantity and unit, and returns a draft with
`confidence` and `warnings`. The form fills in, the user checks the numbers, and `POST /entries`
saves them with `source: AI_ESTIMATE`.

**It is a separate call, not magic inside `POST /entries`.** Intercepting the create request would
mean a write path that waits on a model, turns a provider outage into a failed save, and stores
estimated numbers before the user has seen them. A separate call keeps creating an entry fast and
deterministic, and puts the numbers in front of the user first — which is what "confirm" means. The
UX is the same either way: the form calls the estimator when macros are blank.

The same code backs the chat assistant's `estimate_nutrition` tool, so there is one estimator.

## 3. PDF bulk import

The diary PDF goes straight to the model as a document. We do not write a table parser: real
exported PDFs have merged cells, multi-line rows, repeated headers and inconsistent column names.
Rule-based extraction handles the sample file and breaks on the next one. A model reads the table
the way a person does.

The endpoint is a **pure function** — upload in, candidates out, nothing persisted:

1. Upload, size and MIME checked, page count capped.
2. Sent as a document block with the target schema.
3. The model returns one candidate per diary row.
4. **Our code validates every candidate** with the same entry schema and attaches `valid` plus
   `issues` per row.
5. The response goes back to the browser. No database writes.
6. The browser holds the candidates in component state and renders an editable review table with
   bad rows flagged and excludable.
7. Confirm posts the corrected rows to `POST /entries/bulk`.

No import table, no status column, no lifecycle to keep in sync, and one implementation of "write
these entries" shared with manual logging. The accepted cost: a page refresh mid-review loses the
parse and the call has to be paid for again — about two cents.

Ambiguity rules given to the model: a missing meal type becomes `SNACK`; a row whose date cannot be
parsed comes back with a null date and an issue string, never a guess.

## 4. Chat assistant

The requirement is that a user can do everything through conversation. What makes that cheap to
build: **tools are thin wrappers over the existing services.**

```
ai/tools/entries.tool.ts  -> entriesService.create / list / update / delete
ai/tools/goals.tool.ts    -> goalsService.getCurrent / setGoal
ai/tools/weights.tool.ts  -> weightsService.record / latest
ai/tools/reports.tool.ts  -> reportsService.summary / calories / macros / goalVsActual
```

Each tool is a name, a description, a Zod input schema reused from `packages/shared`, and a call
into a service. No business logic lives in a tool, so a new rule in "log a meal" reaches the REST
route and the assistant at once.

| Tool | Purpose |
|---|---|
| `log_food_entry` | Create one entry |
| `list_food_entries` | Read entries in a date range, optionally by meal type |
| `update_food_entry` | Edit an entry |
| `delete_food_entry` | Remove an entry |
| `get_current_goal` | Read the active goal |
| `set_goal` | Create a new goal version |
| `record_weight` | Log a weight for a day |
| `get_nutrition_report` | Any report, with a `type` argument |
| `estimate_nutrition` | Estimate macros from a food name and quantity |

`estimate_nutrition` is separate from `log_food_entry` on purpose. The assistant estimates, shows
the numbers, and logs only once the user agrees, so it cannot write invented data on its own
initiative.

**Session rules:**

- Every tool call runs with the `userId` from the access token, never from a model argument. The
  model cannot reach another user's data even if it asks to.
- Writes are surfaced to the UI as `tool_start` / `tool_result` events, so the user sees what
  happened and can undo it.
- The system prompt carries today's date, sent by the client, so "yesterday" resolves correctly.
- Turns per message are capped; hitting the cap returns a partial answer rather than looping.
- History is replayed from `chat_messages` in our neutral block format and trimmed to a token
  budget as conversations grow. **Trimming is not a plain "drop the oldest" rule**, because two
  things must survive it:
  - The **system prompt is pinned** and never counted as droppable. It carries the tool contract,
    today's date and the safety rules; losing it mid-conversation is how an assistant starts
    answering as a different assistant.
  - The **most recent turns are pinned**, including the tool calls and tool results from the turn
    in progress. A `tool_use` block whose matching `tool_result` was trimmed away is a malformed
    request, and dropping the last exchange is what makes an assistant forget what it just did.

  So the budget applies to the *middle* of the conversation: oldest-first removal by stored
  `token_count`, stopping at the pinned tail, and always removing a `tool_use` block together with
  its `tool_result` so a pair is never split.

Nutrition questions ("is 40 g of protein enough after a workout?") need no tools. The system prompt
says to answer generally, avoid medical advice, and point to a professional for anything clinical.

## Operational notes

- **Cost control.** AI routes get their own rate limit, per user and per day.
- **Failures.** Provider errors map to `AI_PROVIDER_ERROR` (502) with a plain message. A timeout or
  malformed response is retried once, then surfaced for the user to retry. A broken extraction
  never blocks manual entry.
- **Prompts are files.** `ai/prompts/*.ts` exports template functions, not inline strings, so they
  are reviewable and diffable.
- **Uploads are not stored.** Images and PDFs are processed in memory and discarded; only the
  confirmed data is persisted. Stated in the README; removes the need for blob storage.
- **Logging.** Every AI call logs provider, model, latency, token usage and outcome. No image bytes
  and no PDF content.

---

## What was built

| Piece | Where |
|---|---|
| Port | `apps/api/src/modules/ai/provider/types.ts` |
| Claude adapter | `provider/claude.ts` — structured outputs for extraction, a manual streaming loop for chat |
| Stub adapter | `provider/stub.ts` — fixed answers, no credentials needed |
| Prompts | `ai/prompts/index.ts` — template functions, not inline strings |
| Post-checks | `ai/ai.service.ts` — range, macro/calorie consistency, micro-key filtering |
| Tools | `ai/tools/index.ts` — nine tools, each a schema plus a service call |
| Chat loop | `modules/chat/chat.service.ts` |
| History trimming | `modules/chat/history.ts` |

**Provider selection is `LLM_PROVIDER`.** `stub` is the default so the app runs with no
credentials; `claude` reads them from the environment through the SDK's normal resolution.

**The stub is a deliberate third adapter, not a test double.** It keeps the app demoable without a
key, and it is what proves the port is a real seam. There is no Gemini adapter: an untested second
vendor adapter would be speculative, and adding one later touches a single file.

**Post-checks run for every provider**, including the stub, because they are the part that actually
holds. A prompt is a request; the service is the enforcement.

**Tool arguments are re-validated with Zod inside each tool** before the service is called. Strict
tool use makes schema-valid arguments likely, not guaranteed, and a tool is an untrusted caller.

**A failing tool returns a result, not an exception.** The model reads the error and can react,
which is why a missing goal produces "you have not set a goal yet" instead of a dead conversation.

**Chat uses a manual loop rather than the SDK tool runner.** Two reasons: every tool call has to
reach the browser as it happens, and the transcript is written in our own neutral block format
rather than the provider's.
