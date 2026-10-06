# Interview Guide

This guide explains how this repository is actually built: what each part does, why it is built that way, and how to answer likely questions about it. Every file path below exists in the repo.

---

## 1. The 60-second overview

> "It's a Zoom-style meeting app. The frontend is Next.js with TypeScript and Tailwind. The backend is FastAPI with SQLAlchemy on SQLite. You sign up or sign in (or use a one-click demo account), then you can start an instant meeting, join by meeting ID or invite link, and schedule, edit or delete meetings. All of it is stored in a relational schema with users, auth sessions, meetings and participants.
>
> The meeting room has real camera and mic access, live presence across browsers, and host controls: mute all, mute one person, remove, and end for everyone. Room state syncs through a heartbeat endpoint the client polls every two seconds. That same request keeps you marked as connected and tells your browser if the host muted or removed you.
>
> Audio and video are peer-to-peer WebRTC. The browsers exchange offers, answers and ICE candidates through a small signaling relay in the same FastAPI app, and the media then flows directly between them."

---

## 2. Overall architecture

```
Browser (Next.js)                         FastAPI                          SQLite
─────────────────                         ───────                          ──────
components → hooks → lib/api.ts  ──HTTP──▶ routers → services → models ──▶ users / meetings / participants
                                 ◀─JSON──  (schemas validate input and shape output)
```

- **Frontend and backend are separate apps** that talk only through a JSON REST API. They are deployed separately: the frontend on Vercel, the API on Railway, and the SQLite file on a Railway persistent volume mounted at `/data`.
- The frontend calls the network in **one place only**: `frontend/src/lib/api.ts`.
- The backend has **three layers**:
  - **routers** handle HTTP.
  - **services** hold the business rules.
  - **models and schemas** describe the data.

---

## 3. Backend structure (`backend/app/`)

| File | Responsibility |
| --- | --- |
| `main.py` | Creates the app, adds CORS, registers exception handlers and routers. On startup (`lifespan`) it creates tables and seeds if the DB is empty. |
| `config.py` | Reads environment variables once into a frozen `Settings` dataclass. |
| `database.py` | `create_db_engine()` (turns on `PRAGMA foreign_keys=ON` for SQLite), `SessionLocal`, and the `get_db` dependency, which yields a session and always closes it. |
| `models.py` | ORM models, enums, the `UTCDateTime` column type, `TimestampMixin`, and the `participant_count` column property. |
| `schemas.py` | Pydantic models for every request and response, plus the validation rules: title length, duration range, start time must be in the future, start time must include a timezone. |
| `errors.py` | Domain exceptions with an HTTP status and a machine code. |
| `dependencies.py` | `DbSession`, `CurrentUser` and `OptionalUser`. They read the `Authorization: Bearer` header and look the token up; `CurrentUser` returns 401 if it's missing or invalid. |
| `routers/*.py` | Thin handlers: parse input, call a service, return a schema. |
| `services/auth.py` | Password hashing (scrypt), signup, login, logout, and token → user lookup. |
| `services/meetings.py` | Code generation, create/schedule/update/delete, the upcoming and recent lists, end meeting, and stale-session cleanup. |
| `services/participants.py` | Join, heartbeat, media state, leave, and host controls. |
| `seed.py` | Sample data relative to "now", so the demo always has upcoming meetings. |

**Why services don't import FastAPI:** the business rules stay plain Python. They can be called from tests, scripts or a future WebSocket handler. Services raise `NotFoundError` or `ConflictError`, and `main.py` maps those to HTTP responses in one place.

**Consistent error shape.** Every error response looks like `{"detail": "...", "code": "..."}`. The custom `RequestValidationError` handler turns Pydantic's nested errors into a readable `detail` plus an `errors[]` list. The frontend can then always show `error.detail` with no special cases.

---

## 4. Frontend structure (`frontend/src/`)

| Folder | What's inside |
| --- | --- |
| `app/` | Routes. `(app)/` is a **route group**: Home, Meetings and Settings share the top-nav layout without adding `/app` to the URL. `meeting/[code]` is the full-screen meeting. `j/[code]` redirects invite links on the server. |
| `components/ui/` | Generic building blocks: Button, Dialog, Toast, Menu, Field/TextInput, Switch, Skeleton, Empty and Error states. |
| `components/auth/` | `AuthGate` (sends signed-out visitors to `/login?next=…`), `AuthLayout`, and the login and signup forms. |
| `components/dashboard/` | Action tiles, meeting list items, the Join/Schedule/Delete dialogs, and the Meetings page. |
| `components/meeting/` | `MeetingExperience` (the state machine), `PreJoin`, `MeetingRoom`, `VideoTile`, `ParticipantsPanel`, `MeetingInfoPopover`, `StatusScreen`. |
| `hooks/` | `useMeetings` (list fetching), `useRoomState` (heartbeat polling), `useLocalMedia` (camera/mic), `useIsSpeaking` (audio level), `usePreferences` (localStorage), `useCopyToClipboard`, `useNow`, `useDismiss`. |
| `providers/` | `AuthProvider` holds the signed-in user and exposes `login`, `signup` and `logout`; on load it restores the session from the stored token. `MeetingActionsProvider` owns the dialogs and shared actions like `openSchedule()` and `startInstantMeeting()`, so the top nav, the tiles and the list items can all open them without passing props down. |
| `lib/` | `api.ts` (typed client and `ApiError`), `types.ts` (mirrors `schemas.py`), `format.ts` (dates, durations, ID grouping), `meeting.ts` (parse ID or link, build invitation text). |

**Server vs client components.** Pages are server components. They read `params` and `searchParams`, which are Promises in Next.js 16, and pass plain props to client components. This avoids `useSearchParams` and the Suspense boundaries it requires.

---

## 5. Database design

Four tables: `users`, `auth_sessions`, `meetings`, `participants` (the diagram is in the README).

- **users → auth_sessions (1:N)** through `auth_sessions.user_id` (FK, `ON DELETE CASCADE`). One row per signed-in browser; the token itself is never stored, only its SHA-256.

- **users → meetings (1:N)** through `meetings.host_id` (FK, `ON DELETE CASCADE`).
- **meetings → participants (1:N)** through `participants.meeting_id` (FK, `ON DELETE CASCADE`; SQLAlchemy also has `cascade="all, delete-orphan"`).
- **users → participants (optional)** through `participants.user_id` (nullable FK, `ON DELETE SET NULL`). Guests from an invite link have no account.

What I'd point out:

1. **Public ID vs primary key.** `meeting_code` is a random 11-digit string with a UNIQUE index. URLs use it, so integer IDs never appear in URLs and nobody can guess other meetings by counting.
2. **Each participant row is one session.** Rejoining creates a new row. That gives an attendance log, and "removed" applies to one session. `participant_count` counts **distinct display names**, so a rejoin doesn't count the same person twice.
3. **Statuses are enums.** `meetings.status` is `scheduled → live → ended`. `participants.status` is `joined | left | removed`. They are stored as strings with CHECK constraints (`native_enum=False, create_constraint=True`).
4. **Indexes come from the queries:**
   - `ix_meetings_host_status_start (host_id, status, scheduled_start)` serves "my upcoming or ended meetings sorted by time".
   - `ix_participants_meeting_status (meeting_id, status)` serves "who is in this meeting now".
   - `meeting_code` has a unique index for lookups.
5. **Timestamps:** `created_at` and `updated_at` on every table (`TimestampMixin`, where `onupdate` refreshes `updated_at`). The meeting lifecycle has `started_at` and `ended_at`. Sessions have `joined_at`, `left_at` and `last_seen_at`.
6. **UTC handling.** SQLite has no timezone type. `UTCDateTime` (a `TypeDecorator`) **rejects datetimes without a timezone** on write, converts to UTC, and adds UTC back on read. The API therefore always returns times like `2026-10-07T05:00:00Z`, and the browser formats them in local time.
7. **`participant_count`** is a `column_property` with a correlated subquery, so it's computed in the same SQL query as the meeting row. No N+1 queries when listing meetings.

---

## 6. Why these technologies

**Why FastAPI?**
- Pydantic validation and serialization come built in, so the request schemas *are* the validation.
- Automatic OpenAPI docs at `/docs`.
- Dependency injection (`Depends`) makes sessions and the current user explicit and easy to override in tests.
- Small and fast, with type hints everywhere.

**Why Next.js?** The assignment required it. App Router file-based routing gives route groups and nested layouts. Server components handle the redirect and read the query string. The production build has route-level code splitting. TypeScript keeps frontend types in line with the API.

**Why SQLite?** The assignment required it, and it's the right fit here: no server, a single file, real SQL with foreign keys and constraints. SQLAlchemy keeps the code portable. Switching to PostgreSQL is a change to `DATABASE_URL`, plus migrations.

**Why Tailwind?** Design tokens live in one place (`@theme` in `globals.css`), styles sit next to the markup, and there is no CSS-naming overhead. Every color, like `bg-brand` or `text-ink-muted`, comes from a token.

---

## 7. How the main flows work

### Signing up and signing in
1. The sign-up form checks name, email format and an 8-character password minimum in the browser. The server checks again with Pydantic, lower-cases the email, and returns 409 if it's taken.
2. `services/auth.signup` stores `hash_password(password)`: a random 16-byte salt plus `hashlib.scrypt`, saved as `scrypt$<salt>$<hash>`.
3. `create_session` generates `secrets.token_urlsafe(32)`, stores only its SHA-256 with a 7-day expiry, and returns the raw token once.
4. The browser saves the token in localStorage (`lib/api.ts` → `authToken`) and sends it on every request as `Authorization: Bearer <token>`.
5. `get_current_user` hashes the incoming token, finds the session, deletes it if expired, and returns the user, or raises 401.
6. **Login** looks up the email and verifies the password with a constant-time comparison. If the email doesn't exist it still checks a dummy hash, so "unknown email" and "wrong password" take the same time and return the same message.
7. **Logout** deletes the session row, so the token stops working immediately (a plain JWT can't be revoked like that without extra machinery).
8. **On the frontend**, `AuthGate` wraps Home, Meetings and Settings. Signed-out visitors go to `/login?next=<page>` and come back after signing in. `safeNextPath` only allows relative paths, so `next` can't redirect to another site. If any request gets a 401 while a token is stored, `onUnauthorized` clears the session.
9. The meeting room is **not** behind the gate: a guest with an invite link can join without an account. Starting a meeting **as host** needs the signed-in owner.

### Creating an instant meeting
1. The "New meeting" tile calls `startInstantMeeting()` in `MeetingActionsProvider`.
2. That calls `api.createInstantMeeting()` → `POST /api/meetings/instant`.
3. `services/meetings.create_instant_meeting`:
   - generates a code with `secrets.randbelow` (the first digit is never 0);
   - checks it's unused (the UNIQUE constraint is the final safety net);
   - saves `meeting_type=instant`, `status=scheduled`, and titles it "Alex Morgan's Zoom Meeting".
4. The response includes `join_url`, a Pydantic `computed_field`: `{FRONTEND_URL}/j/{code}`.
5. The browser goes to `/meeting/{code}?host=1&name=Alex Morgan`, which is the pre-join screen.
6. **Start meeting** calls `POST /join` with `as_host: true`. The service checks the caller owns the meeting, sets `status=live` and `started_at`, and creates a host participant.

### Joining
1. `JoinMeetingDialog` runs `parseMeetingInput()` from `lib/meeting.ts`. It accepts `85212345678`, `852 1234 5678`, `852-1234-5678`, or any URL containing `/j/<digits>` or `/meeting/<digits>`. A bad format gets an error message without a network call.
2. `GET /api/meetings/{code}` checks the meeting exists (404 → "This meeting ID is not valid") and isn't ended.
3. The browser goes to `/meeting/{code}?name=…`. Invite links `/j/{code}` arrive on the same page through a server-side `redirect()`.
4. The pre-join screen checks the name isn't empty. `POST /join` validates again on the server (1–50 characters after trimming) and returns `410 Gone` if the meeting has ended.

### Scheduling
1. `ScheduleMeetingDialog` defaults to the next half hour and 30 minutes.
2. The date and time are joined as **local time** (`new Date("2026-10-07T10:30")`) and sent as UTC ISO (`toISOString()`).
3. Validation runs twice:
   - **client side** for instant feedback (required fields, start time in the future);
   - **server side** as the source of truth: `AwareDatetime` rejects times without a timezone, `_ensure_future` allows one minute for clock drift, and the duration must be 15–480.
4. On success the dialog switches to a summary with "Copy invitation", and `refresh()` bumps the `version` counter. Every `useMeetings` hook depends on `version`, so the lists refetch.
5. **Edit** reuses the same form with `PATCH`. The backend applies only the fields that were sent (`exclude_unset`), and editing is blocked once the meeting is no longer `scheduled`. **Delete** asks for confirmation, and the server blocks it while the meeting is live.

**Upcoming vs recent**
- Upcoming = live meetings first, then scheduled meetings whose end time (start + duration) is still in the future. SQL first narrows to rows that started at most 8 hours ago (the maximum duration), then Python applies the exact end-time check.
- Recent = ended meetings, newest first.

### Participants and the room (`useRoomState`)
- After joining, `MeetingRoom` polls `POST /participants/{id}/heartbeat` every 2 seconds. The server:
  1. updates `last_seen_at`;
  2. expires stale sessions;
  3. returns `RoomState { me, meeting, participants }`.
- The client reacts in an `onUpdate` callback, wrapped in `useEffectEvent` so it always sees the latest props:
  - `me.status === "removed"` → "You were removed" screen.
  - `meeting.status === "ended"` → "This meeting has ended".
  - `me.is_muted` is true but the mic is on locally → the host muted me: disable the audio track and show a toast.
- **Race protection:** right after I unmute, a heartbeat that was already in flight could still carry the old "muted" flag. The room ignores the server's mute flag for 4 seconds after a local change (`LOCAL_CHANGE_GRACE_MS`).
- **Leaving:** `POST /leave`. If nobody is left, the meeting ends and moves to Recent. On tab close, `pagehide` sends `fetch(..., { keepalive: true })`. If even that fails, the 30-second heartbeat timeout cleans up.
- **Host controls** send `host_participant_id` and need a signed-in user. `require_host()` checks that the session belongs to this meeting, has `role=host`, is still joined, **and belongs to the signed-in user** (`acting.user_id == user.id`). Otherwise it returns 403, so knowing the host's participant ID isn't enough.

### Camera and microphone (`useLocalMedia`)
- Audio and video are requested **separately**, so a blocked camera doesn't also block the mic.
- Errors become readable messages (`NotAllowedError` → "access is blocked", `NotFoundError` → "no camera found", and so on).
- Mute sets `track.enabled = false`. Stop Video **stops** the track so the camera light turns off. Everything is released on unmount (leaving the room).
- The hook lives in `LiveSession`, which wraps both the pre-join screen and the room. The stream survives the move into the room, and it is released when you reach an exit screen.
- `useIsSpeaking` connects the mic stream to a Web Audio `AnalyserNode`, computes RMS loudness every 120 ms, and holds the result for 450 ms so the green border doesn't flicker.

---

## 8. How the frontend talks to the backend

- `NEXT_PUBLIC_API_URL` sets the base URL (nothing is hardcoded apart from a localhost default for development).
- `request<T>()` in `api.ts`:
  - adds a JSON content type when there's a body;
  - turns network failures into `ApiError(status 0, "network_error")` with a readable message;
  - turns non-2xx responses into `ApiError(status, code, detail)`;
  - returns `undefined` for 204.
- Components never parse errors themselves. They catch, then show a toast or an inline message with `errorMessage(error)`, or branch on `error.status` (for example, 404 → inline field error).
- CORS on the backend allows only `CORS_ORIGINS`.

---

## 9. Validation and error handling

| Layer | What's validated |
| --- | --- |
| Browser | Required fields, meeting ID/link format, start time in the future, name not blank. Errors appear under the field (`aria-invalid` and `role="alert"`). |
| Pydantic | Trimmed string lengths, duration 15–480, datetime must include a timezone and be in the future, `scope` must be `upcoming` or `recent` (a `Literal`). |
| Services | Business rules: can't edit a started meeting (409), can't delete a live one (409), only the owner can join as host (403), guests can't join ended meetings (410), only the host can use host controls (403), the host can't remove themselves (409). |
| Database | NOT NULL, UNIQUE (`email`, `meeting_code`), FKs with cascades, CHECK constraints on enums. |

UI states: every list has **loading** (skeleton rows), **empty** (illustration and call to action), and **error** (message and "Try again"). Refetches keep old data visible instead of flashing skeletons. The room shows "Reconnecting…" after two failed heartbeats in a row.

---

## 10. Important technical decisions (and trade-offs)

1. **Polling vs WebSockets.** Polling is stateless, simple, works on any host, and doubles as presence detection. The cost is up to 2 seconds of latency and one request per participant every 2 seconds. That's fine for a demo. WebSockets come next.
2. **Lazy cleanup vs a background job.** `expire_stale_sessions()` runs before reads that need fresh presence (lists, participants, heartbeat). No scheduler process is needed. The cost is a small write inside a GET request. A production system would use a periodic worker or a Redis key that expires.
3. **Opaque session tokens instead of JWTs.** A random token with its hash in the database is simple, needs no extra library, and can be revoked instantly by deleting the row. The cost is one indexed lookup per request; JWTs avoid that lookup but are hard to revoke before they expire.
4. **Bearer header instead of cookies.** The frontend (Vercel) and API (Railway) are on different domains, where cookies run into third-party-cookie blocking and CSRF concerns. The trade-off is that a token in localStorage can be read by injected scripts (XSS); with a shared domain an HttpOnly cookie would be safer.
5. **The host is a role on a participant session, not just a user.** That models Zoom properly (co-hosts would be another role value) and lets controls check "is *this session* the host *of this meeting*".
6. **Native `<dialog>` and the Popover API instead of a UI library.** You get accessibility, focus trapping and top-layer stacking with no extra dependencies.
7. **Small dependency footprint.** The frontend's only runtime dependency beyond Next and React is `lucide-react`. The backend has five packages; auth uses only the standard library (`hashlib`, `secrets`, `hmac`).

---

## 11. What I'd improve for production

- **Auth:** email verification, password reset, rate limiting and lockout on sign-in, OAuth (Google/Microsoft), HttpOnly cookies when the frontend and API share a domain, and meeting passcodes or a waiting room. Give each participant session its own secret so guests' sessions can't be acted on by ID alone.
- **Real-time:** WebSockets (or SSE) for room events, Redis pub/sub so it works across multiple API instances, and Redis TTL keys for presence.
- **Media:** an SFU for meetings beyond a handful of people, a hosted TURN relay, and WebSocket signaling (next section).
- **Data:** PostgreSQL, Alembic migrations, connection pooling, and soft deletes or audit history.
- **Ops:** rate limiting, structured logging, error tracking (e.g. Sentry), health and readiness checks, CI running pytest, the type check, lint, build and the end-to-end script.
- **Testing:** component tests (Vitest and Testing Library) for forms and hooks, and the end-to-end script in CI.

---

## 12. How the WebRTC audio/video works (and how it would grow)

**What's implemented** (`hooks/usePeerConnections.ts`, `services/signaling.py`):

1. **Mesh.** Each pair of participants has one `RTCPeerConnection`; media goes browser to browser.
2. **Who calls whom.** The participant who joined later (higher participant id) sends the offer. A newcomer calls everyone already present, and two sides never offer at once ("glare").
3. **Signaling relay.**
   - Sending: `POST /participants/{id}/signals` with `{recipient_id, kind: offer|answer|ice, payload}`. The server checks both sessions are joined and in the same meeting.
   - Receiving: the room polls `GET …/signals?after=<cursor>` every 0.7 s. Messages up to the cursor are deleted as acknowledged.
4. **Ordering matters.**
   - **Sending:** each client sends its signals one after another (a promise queue), so an ICE candidate can never reach the server before its offer.
   - **Receiving:** candidates that still arrive early are buffered until the offer is applied.
   - **IDs:** the table uses SQLite `AUTOINCREMENT`, so message ids never go backwards after deletions. Without it, a new offer could be skipped, and that was a real bug I found while testing with three people.
5. **Tracks.** Every connection gets an audio and a video transceiver up front (`sendrecv`). Muting disables the mic track; turning the camera off or on swaps it with `sender.replaceTrack`, so there's no renegotiation.
6. **Rendering.** Remote video goes into the tile's `<video>`. Remote audio plays through a separate hidden `<audio>`, so you still hear people whose camera is off. The green "speaking" border works for remote participants too, by analysing their incoming audio.
7. **Recovery and cleanup.**
   - If a connection fails, the caller retries after 2 seconds.
   - **Video watchdog:** if someone's camera is on but no frames arrive for 8 seconds, their connection is re-established (at most once every 15 seconds).
   - **Camera dropouts:** if your camera stops by itself (the track fires `ended`), `useLocalMedia` restarts it up to 3 times, then switches video off and tells the server, so nobody sees a frozen picture.
   - **Strict Mode safety:** camera acquisition survives React's development double-mount. Release is deferred by one tick, so an immediate remount keeps the devices.
   - Connections close when a participant leaves, and all of them close when you leave.
8. **NAT traversal.** Google STUN by default; a TURN relay can be added through env vars.

**How it would grow:**
- **Signaling** over WebSockets instead of polling, for faster call setup.
- **An SFU** (LiveKit, mediasoup) beyond about 6 people: each client uploads once instead of once per participant.
- **A hosted TURN service** (coturn, Twilio, Cloudflare) for strict networks.
- **Stronger host mute:** an SFU can stop forwarding a muted participant's audio, so it doesn't depend on the client obeying.

---

## 13. How the system could scale

- **API:** stateless FastAPI behind a load balancer, with several Uvicorn/Gunicorn workers per instance.
- **Database:** PostgreSQL with read replicas for list queries. The existing composite indexes already match the access patterns.
- **Presence and room state:** move heartbeats out of the SQL database into Redis (TTL keys and sets per meeting). Write only lasting events (join, leave, end) to Postgres.
- **Real-time fan-out:** WebSocket servers subscribe to Redis pub/sub channels per meeting, so any instance can push to any client.
- **Media:** SFU clusters by region, and participants route to the nearest one. Media is the main cost and is separate from the API.
- **Frontend:** static and edge-served by Vercel. Only meeting pages need data from the API.
- **Today's deployment** is one Railway instance with SQLite on a volume. That is correct for SQLite (one writer process), but it's the first thing to change for scale: move to PostgreSQL, then run several API instances.

---

## 14. Likely interview questions (with answers grounded in this code)

**Q: How do you guarantee meeting IDs are unique?**
`_unique_meeting_code()` generates a random 11-digit code with `secrets` and checks the table first. There are about 9×10¹⁰ possible codes, so a collision is very unlikely. The **UNIQUE constraint** on `meetings.meeting_code` is the real guarantee: even if two requests raced, the database would reject the duplicate.

**Q: Why not use the primary key as the meeting ID?**
Sequential IDs can be guessed, so anyone could count through meetings. They also leak how many meetings exist. A random public code separates "how we store it" from "what we share".

**Q: Walk me through what happens when the host clicks "Mute all".**
`ParticipantsPanel` → `api.muteAll(code, myParticipantId)` → `POST /meetings/{code}/mute-all`. `require_host()` checks that my session is the joined host of that meeting, then `mute_all()` sets `is_muted=True` for every other joined participant. Each guest's next heartbeat (within 2 seconds) returns `me.is_muted=true`, and `MeetingRoom`'s `onUpdate` sees its local mic is still on. It disables the audio track and shows "The host muted you". Guests can unmute themselves afterwards, which matches Zoom's default.

**Q: What if a user closes the tab without clicking Leave?**
On `pagehide` we send a `keepalive` fetch to `/leave`. If that doesn't arrive (crash, network loss), heartbeats stop. After 30 seconds `expire_stale_sessions()` marks the session as left, and ends the meeting if nobody is left.

**Q: How do you handle time zones?**
The browser sends UTC ISO strings with `Z`. Pydantic `AwareDatetime` rejects times without a timezone, and `UTCDateTime` stores UTC and returns aware UTC. Formatting into local time happens only in the browser (`lib/format.ts`), and the schedule dialog shows the user's time zone.

**Q: Where does validation happen and why twice?**
In the browser for instant feedback, and on the server because the server is the source of truth: clients can be bypassed. The rules match: future start, required title, duration bounds.

**Q: How does authentication work?**
Sign-in returns a random token. The server stores only its SHA-256 in `auth_sessions` with a 7-day expiry. The client sends it as `Authorization: Bearer <token>`, and the `get_current_user` dependency resolves it to a user or raises 401. Routes just declare `user: CurrentUser`. Logout deletes the row, which revokes the token immediately.

**Q: How are passwords stored?**
With `hashlib.scrypt` and a random 16-byte salt per password, saved as `scrypt$<salt>$<hash>`. scrypt is deliberately slow and memory-hard, which makes brute-forcing a leaked database expensive. Verification uses `hmac.compare_digest`, a constant-time comparison.

**Q: Why not JWT?**
A JWT is valid until it expires, so logging out or revoking access needs a blocklist, which means a database lookup anyway. Opaque tokens give instant revocation with one indexed query and no extra dependency. JWTs make more sense when many services must verify tokens without sharing a database.

**Q: Why can guests join without an account?**
That's how Zoom works: an invite link is enough. The join endpoint uses `OptionalUser`. Only starting a meeting as host requires the signed-in owner, and host controls check that the acting host session belongs to the signed-in user.

**Q: The assignment said "assume a default logged-in user". Doesn't login contradict that?**
Login/signup was listed as a bonus, so I built it, but kept the default-user experience: the sign-in page has a one-click "Continue with demo account" button that signs in as the seeded Alex Morgan.

**Q: Why is there no Redux or React Query?**
The state is small: the signed-in user, two lists, and one room. A ~40-line `useMeetings` hook covers loading, error and retry. Cross-component actions go through one context. Adding a library would add concepts without solving a real problem here.

**Q: How does the dashboard know to refresh after scheduling?**
`MeetingActionsProvider` keeps a `version` counter. `onSaved` and `onDeleted` increment it. `useMeetings` has `version` in its effect dependencies, so both lists refetch. It also refetches when the window regains focus.

**Q: Why polling every 2 seconds and not 200 ms?**
It balances freshness against load: each participant makes one lightweight request every 2 seconds. Host actions call `refresh()` to poll immediately, so the host sees changes at once. For lower latency I'd switch to WebSockets rather than poll faster.

**Q: What's `useEffectEvent` doing in `useRoomState`?**
The polling effect should restart only when the participant changes, but the `onUpdate` callback needs the latest `media.isMuted`. `useEffectEvent` gives a stable function that always calls the latest callback, so there are no stale closures and no restarted polling loop.

**Q: Why `useSyncExternalStore` for preferences?**
localStorage is an external store. The server snapshot returns defaults, so server-rendered HTML matches, and then the client reads the real value without a hydration mismatch. A shared listener set keeps every reader in sync, including across tabs through the `storage` event.

**Q: How do you avoid N+1 queries on the meeting lists?**
The host is loaded with `joinedload(Meeting.host)`, and `participant_count` is a correlated subquery `column_property`. One SQL statement returns everything a list item needs.

**Q: What happens if two people join the same meeting at exactly the same moment?**
Each join inserts its own participant row, so there's no conflict. The meeting's switch from `scheduled` to `live` is idempotent: both requests set `live`, and `started_at` is only set if it's empty.

**Q: What are the known weaknesses?**
- Media is a peer-to-peer mesh with STUN only: fine for small meetings, but large meetings need an SFU and some networks need TURN.
- Minimal auth: no email verification, password reset or sign-in rate limiting, and the token sits in localStorage (readable if the page ever had an XSS bug).
- Guest participant sessions are identified by numeric ID alone (host controls are protected by login, though).
- Polling latency.
- `create_all` instead of migrations.
- Free-tier SQLite storage resets on redeploy.

All of these are documented, with the production fix for each.

**Q: How do participants see and hear each other?**
Peer-to-peer WebRTC. Our server never carries audio or video; it only relays the small signaling messages (SDP offer/answer and ICE candidates) that let two browsers find a direct route. After that, media flows browser to browser.

**Q: What was the hardest bug?**
With three people, the third person's calls stayed on "connecting". There were two causes:
- **Out-of-order sends.** Signals were sent as parallel HTTP requests, so ICE candidates could reach the server before their offer. I fixed it with a sequential send queue plus buffering of early candidates.
- **Reused SQLite ids.** Delivered signals are deleted, and plain SQLite reuses deleted rowids. A new offer got an id *below* the host's cursor and was silently skipped. `AUTOINCREMENT` fixed it, and a regression test now proves the test fails without the fix.

**Q: How did you test it?**
- 28 pytest API tests, each against a fresh in-memory SQLite database. That includes 9 for auth (revocation, expiry, ownership, guest joins, a stolen host participant ID being refused) and 4 for signaling, among them a regression test for the reused-rowid bug.
- TypeScript strict mode, ESLint and a production build.
- An end-to-end script (`e2e/flow.mjs`) that drives a host and a guest in two real Chrome sessions with fake camera and mic. It checks 32 behaviours: sign-in redirect, wrong password, sign-up, the dashboard checklist, host mute reaching guests, remove, end, schedule/edit/delete, invite links, an account-less guest joining, sign-out, and no horizontal overflow at phone and tablet widths.
- A media test (`e2e/media.mjs`) runs one Chrome per participant, with fake camera and mic. It checks:
  - remote video frames arrive and remote audio is audible (measured with the Web Audio API);
  - muting silences the audio for others;
  - the camera can go off and back on mid-call;
  - a third participant receives both other videos.
