# Plan: Migrate Renderer Agent Hooks from HTTP to DataApi

## Context

PR `feat/agents-data-api` wired DataApi handlers for the agents domain. The renderer
currently calls the Express `apiServer` via `AgentApiClient` (HTTP). This plan replaces
all those HTTP calls with `useQuery`/`useMutation` from `@data/hooks/useDataApi`.

**Not in scope for this PR:**
- `AgentMessageDataSource` IPC calls (`AgentMessage_PersistExchange`, `AgentMessage_GetHistory`)
  — these are intentionally deferred to a follow-up that redesigns the message persistence layer.
- `useChannels` / `useModels` — channels have no DataApi schema yet; models are a separate
  non-agent endpoint. Both stay on HTTP.

---

## Phase 1 — Extend DataApi Schemas + Handlers

Three missing endpoints must be added before hooks can be migrated:

### 1a. `/agents/order` PUT (v2-compliant)
**Schema** (`packages/shared/data/api/schemas/agents.ts`):
```ts
'/agents/order': {
  PUT: {
    body: { orderedIds: string[] }
    response: void
  }
}
```
**Handler** (`src/main/data/api/handlers/agents.ts`): delegate to `agentService.reorderAgents(body.orderedIds)`.

_Rationale: v2 standard prefers noun-based sub-resources and PUT for set-value
operations; see `api-design-guidelines.md` § "PATCH vs Dedicated Endpoints"._

### 1b. `/agents/:id/sessions/order` PUT (v2-compliant)
**Schema**:
```ts
'/agents/:id/sessions/order': {
  PUT: {
    params: { id: string }
    body: { orderedIds: string[] }
    response: void
  }
}
```
**Handler**: delegate to `sessionService.reorderSessions(params.id, body.orderedIds)`.

_No route collision: `/agents/:id/sessions/:sid` has only GET/PATCH/DELETE, so PUT
on this nested path is unambiguous regardless of pattern-matching order._

> `'/agents/:id/sessions/reorder'`

**Review (V):** Route-collision risk worth verifying — specific before general.
`ApiServer.findHandler` (`src/main/data/api/core/ApiServer.ts:128`) first tries a direct
string-equality lookup, then falls through to a pattern loop that iterates
`Object.entries(this.handlers)` in **declaration/insertion order**, first-match wins.

- Top-level `/agents/reorder` is safe: direct lookup hits it before any pattern loop.
- Nested `/agents/:id/sessions/reorder` is **not** safe by construction — both it and
  `/agents/:id/sessions/:sid` are patterns. Whichever appears first in the schema
  object wins. If `/agents/:id/sessions/:sid` is declared first (as it is today in
  `schemas/agents.ts`), PATCH `/agents/abc/sessions/reorder` will match that pattern
  with `sid="reorder"` and the reorder handler will never fire.

Phase 1 should either (a) require new paths to be registered **before** the matching
`:sid`/`:tid` patterns (and add a test asserting this), or (b) pick a non-colliding
shape like `/agents/:id/sessions:reorder` or POST `/agents/:id/sessions/_actions/reorder`.
The current ApiServer also has no "most-specific wins" logic, so (a) is fragile to
future edits — (b) is probably the sturdier choice.

**Resolved:** Reshape per v2 standard (`api-design-guidelines.md` § "PATCH vs
Dedicated Endpoints": noun-based sub-resource + PUT for set-value). The reorder
endpoints become:
- `PUT /agents/order`  body `{ orderedIds: string[] }`  response: `void`
- `PUT /agents/:id/sessions/order`  body `{ orderedIds: string[] }`  response: `void`

Collision is resolved by **method separation**, not path-ordering: `/agents/:id` has
no PUT; `/agents/:id/sessions/:sid` has GET/PATCH/DELETE only. `PUT /agents/order`
hits `findHandler`'s direct-lookup branch before any pattern loop, and
`PUT /agents/:id/sessions/order` has no competing PUT pattern to collide with. The
schemas in Phase 1a/1b have been updated accordingly.

### 1c. `/tasks` GET (global task list, v2-compliant pagination)
`useTasks` lists ALL tasks across all agents (used in TasksSettings). The existing DataApi
only exposes `/agents/:id/tasks`. Add a top-level endpoint:
```ts
'/tasks': {
  GET: {
    query: OffsetPaginationParams
    response: OffsetPaginationResponse<ScheduledTaskEntity>
  }
}
```
**Handler**: delegate to `taskService.listAllTasks(query)`, shape result as
`{ items, total, page }`.

---

## Phase 1.5 — Normalize pagination responses to v2 standard

The existing agent list responses in `packages/shared/data/types/agent.ts` use the
non-compliant `{ data, total, limit, offset }` shape. V2 offset pagination requires
`OffsetPaginationResponse<T>` = `{ items, total, page }` (see `miniapps.ts`,
`translate.ts`, `assistants.ts`). Normalize before any renderer hook migration:

### 1.5a. Update response types (`packages/shared/data/types/agent.ts`)
```ts
// Before
export interface ListAgentsResponse {
  data: AgentDetail[]
  total: number
  limit: number
  offset: number
}
// After
export type ListAgentsResponse = OffsetPaginationResponse<AgentDetail>
```
Apply the same to `ListAgentSessionsResponse` (→ `OffsetPaginationResponse<AgentSessionEntity>`),
`ListTasksResponse` (→ `OffsetPaginationResponse<ScheduledTaskEntity>`),
`ListSkillsResponse` (→ `OffsetPaginationResponse<InstalledSkill>`).

### 1.5b. Update DataApi handlers (`src/main/data/api/handlers/agents.ts`)
Return `{ items, total, page }` instead of `{ data, total, limit, offset }` for all
four list endpoints: `/agents`, `/agents/:id/sessions`, `/agents/:id/tasks`, `/skills`.

### 1.5c. Out of scope (keep as-is)
HTTP `apiServer/routes/agents/handlers/*.ts` keep returning the legacy shape — they
are deleted alongside `AgentApiClient` in Phase 3. Do NOT touch them in Phase 1.5.

After Phase 1 + 1.5: run `pnpm lint && pnpm test` to confirm no regressions.

---

## Phase 2 — Migrate Hooks (one file per commit)

Commit order chosen so each change is independently reviewable and testable.

### 2.1 `useAgent.ts` — single agent fetch
Replace `useSWR` + `useAgentClient` with:
```ts
const { data: agent, isLoading, error, refetch } = useQuery(`/agents/${id!}`, {
  enabled: !!id
})
```
Remove: `useApiServer`, `useAgentClient`, `client` guard, manual fetcher.

> ```ts
> const { data: agent, isLoading, error, refetch } = useQuery('/agents/:id', {
>   params: { id: id! },
>   enabled: !!id
> })
> ```

**Review (V):** The current `useQuery` / `useMutation` signatures in
`src/renderer/src/data/hooks/useDataApi.ts` accept only `{ query, enabled, swrOptions }` —
there is no `params` field. `TPath` is constrained to `ConcreteApiPaths`, which is the
**resolved** path type (`/agents/${string}`), not the template `'/agents/:id'`. So the
snippet above won't type-check, and the existing in-tree usage (`useMCPServers`) passes
the bare concrete path.

The plan needs to commit to one of two mutually exclusive directions and apply it
consistently across Phase 2:

1. **Extend `useDataApi`** to accept `params: { id: ... }` and do the template →
   concrete-path substitution internally (so SWR cache keys are stable across callers
   using `'/agents/:id'` with different `id`s, and `refresh: ['/agents/:id']` matches).
   This belongs as an explicit Phase 1 task — it is not free.
2. **Use interpolated concrete paths** (`` `/agents/${id}` ``) everywhere, matching
   today's SWR in-tree usage. Under this option the `refresh` arrays must also be
   interpolated because `createMultiKeyMatcher` does strict `===` against `key[0]`;
   a mutation that lists `refresh: ['/agents/:id']` will never invalidate a cache
   entry keyed `` `/agents/${id}` ``.

The plan currently **mixes both**: 2.1/2.2/2.4/2.5 use `'/agents/:id'`-style templates,
while 2.3/2.6/2.8/2.11 use interpolated `` `/${id}` ``. This is the single biggest
correctness question in the plan and I'd like it resolved explicitly with the
tradeoff documented before any migration commit lands.

**Resolved:** Option 2 — interpolated concrete paths everywhere, per v2 standard
(`docs/references/data/data-api-in-renderer.md` lines 23, 229, 258, 262 all use
`` `/topics/${topic.id}` `` form). `useDataApi` is not extended. `refresh` arrays
are interpolated to match the cache keys actually used by `useQuery`. All Phase 2
snippets below have been updated to use `` `/agents/${id}` ``-style consistently.

### 2.2 `useAgents.ts` — agent list + mutations
```ts
const { data, isLoading, error, mutate } = useQuery('/agents')
const agents = data?.items ?? []  // OffsetPaginationResponse shape post Phase 1.5

const { trigger: createTrigger } = useMutation('POST', '/agents', { refresh: ['/agents'] })
// For delete/reorder, the mutation path is interpolated at call site via useCallback
// (see per-id mutation pattern in 2.3). The refresh key must match the exact cache
// key — '/agents' matches the list cache; individual agent caches are invalidated by
// subsequent per-id mutations.
```
`addAgent`, `deleteAgent`, `reorderAgents`, `getAgent` rewritten as `useCallback` wrappers.
`reorderAgents` uses `PUT /agents/order` (see Phase 1a). Preserve the current optimistic
update behavior via `mutate(reorderedList, { revalidate: false })` on the `/agents` key
before triggering, with manual rollback via `mutate()` on error.

Remove: `useApiServer`, `useAgentClient`, SWR key derivation from `client.agentPaths.base`.

### 2.3 `useUpdateAgent.ts` — agent update mutation
```ts
const { trigger } = useMutation('PATCH', `/agents/${id}`, { refresh: ['/agents', `/agents/${id}`] })
```
The active-session revalidation logic stays unchanged, but uses the DataApi cache key
(`/agents/:id/sessions/:sid`) instead of the HTTP URL key.

### 2.4 `useSessions.ts` — session list + mutations (v2-compliant pagination)
Offset pagination using v2-standard `usePaginatedQuery` against the normalized
`OffsetPaginationResponse<AgentSessionEntity>` shape (see Phase 1.5):
```ts
const { items: sessions, total, page, hasNext, hasPrev, nextPage, prevPage } =
  usePaginatedQuery(`/agents/${agentId}/sessions`, { limit: 20 })
```
Mutations — paths interpolated at call site:
```ts
useMutation('POST',   `/agents/${agentId}/sessions`,        { refresh: [`/agents/${agentId}/sessions`] })
useMutation('DELETE', `/agents/${agentId}/sessions/${sid}`, { refresh: [`/agents/${agentId}/sessions`] })
useMutation('PUT',    `/agents/${agentId}/sessions/order`,  { refresh: [`/agents/${agentId}/sessions`] })
```
The `getSession` callback for explicit refresh remains a `refetch` call.

> Infinite pagination: use `useInfiniteQuery('/agents/:id/sessions', ...)` from `useDataApi`.

**Review (V):** Hook/response-shape mismatch. `useInfiniteQuery` in `useDataApi.ts`
requires the endpoint to return `CursorPaginationResponse<T>` (items + `nextCursor`,
driven by `cursor`/`limit` query params). But `/agents/:id/sessions` GET today returns
`ListAgentSessionsResponse`, which the existing HTTP handler
(`src/main/apiServer/routes/agents/handlers/sessions.ts:376`) produces as
`{ data, total, limit, offset }` — offset-based. And the DataApi handler in
`src/main/data/api/handlers/agents.ts:79-80` returns the same `{ data, total, limit, offset }`
shape without any cursor.

So `useInfiniteQuery` will not fit: `InferPaginatedItem` infers `unknown` because the
response isn't `PaginationResponse<T>`, and `loadNext` gates on `nextCursor` which never
exists — the paginator will stop after page 1.

Options worth documenting:
- Use `usePaginatedQuery` (offset-based, already provided by `useDataApi`). But
  `ListAgentSessionsResponse` exposes `data` not `items`, so the hook's
  `paginatedData.items` shortcut won't work without schema rename.
- Convert the DataApi response to cursor-based pagination (server change).
- Keep `useQuery` and paginate manually via `query: { offset, limit }` — matches how
  today's `useSessions` already works with SWR+offset.

Either way the plan needs to pick one and note the schema/response adjustments it
implies.

**Resolved:** Normalize to v2 standard (`usePaginatedQuery` + `OffsetPaginationResponse<T>`).
V2 offset pagination is `{ items, total, page }` — see `miniapps.ts`, `translate.ts`,
`assistants.ts` schemas, all `response: OffsetPaginationResponse<T>`. The agent
responses today (`{ data, total, limit, offset }`) are non-compliant. Added **Phase
1.5** below to normalize all agent list responses (`ListAgentsResponse`,
`ListAgentSessionsResponse`, `ListTasksResponse`, `ListSkillsResponse`) and update
the DataApi handlers to return `{ items, total, page }`. HTTP `AgentApiClient` is
deleted in Phase 3, so it doesn't constrain the shape change. Phase 2.4 uses
`usePaginatedQuery('/agents/${id}/sessions', { limit: 20 })`.

### 2.5 `useSession.ts` — single session fetch
```ts
const { data: session, isLoading, error, mutate } = useQuery(
  `/agents/${agentId!}/sessions/${sessionId!}`,
  { enabled: !!agentId && !!sessionId }
)
```

### 2.6 `useUpdateSession.ts` — session update mutation
```ts
const { trigger } = useMutation('PATCH', `/agents/${agentId}/sessions/${sessionId}`, {
  refresh: [`/agents/${agentId}/sessions`]
})
```
Optimistic update logic is preserved but uses DataApi cache keys instead of HTTP URL keys.

### 2.7 `useAgentSessionInitializer.ts` — session init on agent activation
Replace `client.listSessions(agentId)` with a direct
`dataApiService.get(`/agents/${agentId}/sessions`)` call (non-hook context, used
inside `useEffect`). Alternatively, use `prefetch` from `useDataApi`.

### 2.8 `useTasks.ts` — task list + CRUD mutations
```ts
// Global list (TasksSettings), offset pagination per Phase 1c / 1.5
const { items: tasks, total, page, nextPage, prevPage } =
  usePaginatedQuery('/tasks', { limit: 200 })

// Per-agent mutations, paths interpolated at call site
useMutation('POST',   `/agents/${agentId}/tasks`,             { refresh: ['/tasks'] })
useMutation('PATCH',  `/agents/${agentId}/tasks/${taskId}`,   { refresh: ['/tasks'] })
useMutation('DELETE', `/agents/${agentId}/tasks/${taskId}`,   { refresh: ['/tasks'] })
```

### 2.9 `pages/settings/TasksSettings.tsx` — inline task client calls
Replace the `useAgentClient()` call at line 763 with `useTasks` / `useUpdateTask` hooks
already migrated in 2.8.

### 2.10 `pages/agents/components/Sessions.tsx` — inline session delete
Replace `useAgentClient()` + `client.deleteSession()` with the `deleteSession` returned
from the migrated `useSessions` hook.

### 2.11 `store/thunk/messageThunk.ts` — three `createAgentApiClient` calls
| Line | Current call | Replacement |
|------|-------------|-------------|
| ~227 | `client.createSession(agentId, ...)` | `dataApiService.post(`/agents/${agentId}/sessions`, { body: ... })` |
| ~773 | `client.createSession(agentId, ...)` | same |
| ~980 | `client.getAgent(activeAgentId)` | `dataApiService.get(`/agents/${activeAgentId}`)` |
All three are non-hook imperative calls inside thunk actions; use `dataApiService`
typed methods directly (not a `.request()` call — the service exposes
`get/post/put/patch/delete`).

---

## Phase 3 — Cleanup

After all migrations pass `pnpm lint && pnpm test`:

1. **Delete** `src/renderer/src/api/agent.ts` — `AgentApiClient` class, all HTTP methods,
   `DEFAULT_SESSION_PAGE_SIZE` (move to constants if still needed).
2. **Delete** `src/renderer/src/hooks/agents/useAgentClient.ts` — `useAgentClient`,
   `requireAgentClient`, `AGENT_API_CLIENT_UNAVAILABLE_ERROR`.
3. **Keep** `useChannels.ts` — channels are not in the DataApi schema; stays on HTTP.
4. **Keep** `useModels.ts` — models endpoint is unrelated to agents DataApi.
5. **Remove** `useApiServer` guards from any remaining hook that had them (e.g. the
   `apiServerRunning && apiServerConfig.apiKey` checks that were only needed because
   the HTTP server required auth).

---

## Key Decisions

| Question | Decision |
|----------|----------|
| `AgentMessageDataSource` IPC calls | Keep as-is; deferred to message-persistence PR |
| `useChannels` | Keep on HTTP; no DataApi schema for channels |
| `useModels` | Keep on HTTP; out of agents domain |
| Reorder endpoints | `PUT /agents/order` + `PUT /agents/:id/sessions/order` (v2 noun-based) |
| Global `/tasks` endpoint | Add to DataApi with `OffsetPaginationResponse<ScheduledTaskEntity>` |
| Pagination shape | Normalize all agent list responses to `OffsetPaginationResponse<T>` (Phase 1.5) |
| Path form in hooks | Interpolated concrete paths (`` `/agents/${id}` ``) per v2 renderer doc |
| `apiServerRunning` guards | Remove after migration — DataApi doesn't need auth guard |

---

## Acceptance Criteria

- `pnpm lint && pnpm test` green on each commit.
- `AgentApiClient` and `useAgentClient` are deleted.
- No renderer file imports from `@renderer/api/agent` except `useChannels.ts` and `useModels.ts`.
- `useApiServer` is no longer referenced in any agent hook.
- The `feat/agents-renderer-dataapi` branch has no direct HTTP calls to `apiServer` for
  agents, sessions, tasks, or skills.
