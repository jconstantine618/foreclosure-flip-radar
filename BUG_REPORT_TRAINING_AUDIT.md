# Bug Report — Training Portal Audit
**Date:** 2026-03-28
**Scope:** `/training` route and all directly related components. Also captures issues in adjacent pages (`/challenge`, `/manager`, `/onboarding`, `/transcripts`) discovered during the audit.

---

## How This Was Audited

The site is a React SPA; browser tools can only see the static HTML shell. This audit was done via full source code review of:
- `src/pages/TraineePortal.tsx`
- `src/pages/LandingPage.tsx`
- `src/pages/ManagerDashboard.tsx`
- `src/pages/PlaybookOnboarding.tsx`
- `src/pages/TranscriptLibrary.tsx`
- `src/components/DayContent.tsx`
- `src/components/Header.tsx`
- `src/components/OnboardingWelcome.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/hooks/useAuth.tsx`
- `src/hooks/usePlaybook.ts`
- `src/hooks/useCurriculumProgram.ts`

---

## Severity Key
- **P0** — Broken feature / data corruption
- **P1** — Wrong behavior that users will notice
- **P2** — Visual glitch or minor incorrect behavior

---

## P0 — Broken / Data Corrupting

### BUG-001: Chapter completion notifications fire for previously-completed chapters on every page load

**File:** `src/pages/TraineePortal.tsx` lines 286–307
**What happens:** `prevCompletedChaptersRef` is initialized with `completedChapters` at first render, before `fetchProgress` has returned. At that point `completedChapters === 0`. When `fetchProgress` resolves and `completedChapters` jumps to N (e.g. 3), the `useEffect` detects `completedChapters > prev` and fires `send-notifications` for each already-completed chapter. **Every page load sends false chapter-completion emails/notifications to managers for returning users.**

```tsx
// Line 286 — initialized before progress loads, so it's 0
const prevCompletedChaptersRef = useRef<number>(completedChapters);
```

**Fix direction:** Initialize the ref to `-1` and skip the notification on the very first time progress loads, or only fire notifications when a task-completion action is directly triggered by the user (not passively on data load).

---

### BUG-002: `fetchChatSessions` does not filter by `programType`

**File:** `src/pages/TraineePortal.tsx` lines 89–104
**What happens:** The chat sessions query has no `.eq("program_id", programType)` filter. This means users who have done both the `sales` and `csr` programs see combined chat history. `isChatCompletedForDay` and `avgChatScore` are calculated from the merged pool, making them inaccurate. A user could appear to have completed an AI practice session for a day they haven't touched in the current program.

```tsx
// Missing filter — no .eq("program_id", programType)
const { data, error } = await supabase
  .from("chat_sessions")
  .select("id, day_number, overall_score, completed_at")
  .eq("user_id", user.id)
  .not("completed_at", "is", null);
```

**Fix direction:** Add `.eq("program_id", programType)` (matching the filter used in `fetchProgress`).

---

## P1 — Wrong Behavior Users Will Notice

### BUG-003: Transcripts button on training page sends managers into a redirect loop

**File:** `src/pages/TraineePortal.tsx` line 402
**What happens:**
```tsx
navigate(userRole === "employee" ? "/team/transcripts" : "/transcripts")
```
When a `manager` or `super_admin` visits `/training` and clicks the Transcripts button, they are navigated to `/transcripts`. That route is protected with `allowedRoles={["individual"]}`. ProtectedRoute redirects them back to `/training`. The user is stuck in a loop and can never reach transcripts from the training page.

**Fix direction:** The navigation should be three-way:
```tsx
const transcriptPath =
  userRole === "employee" ? "/team/transcripts"
  : userRole === "manager" || userRole === "super_admin" ? "/manager/transcripts"
  : "/transcripts";
navigate(transcriptPath);
```

---

### BUG-004: UserRole race condition — role-dependent UI briefly shows wrong state

**File:** `src/components/ProtectedRoute.tsx` line 77, `src/hooks/useAuth.tsx` lines 176–181
**What happens:** After `loading` becomes `false`, `user` is set immediately but `fetchUserData` (which sets `userRole`) is async and fires separately. There's a render window where `user` is truthy but `userRole` is `null`.

In `ProtectedRoute`:
```tsx
// userRole is null → condition is falsy → children render with null role
if (userRole && !allowedRoles.includes(userRole as UserRole)) {
  return <Navigate to={redirectTo} replace />;
}
```

During this window in `TraineePortal`:
- The "Create Playbook" warning banner shows for employees (`null !== "employee"` is true) — wrong
- The transcript navigation uses `null === "employee"` = false, sending employees to `/transcripts` instead of `/team/transcripts`
- The role-based nav buttons (Manager Dashboard, Admin Dashboard) may flash incorrectly
- `OnboardingWelcome` may appear briefly with wrong role-specific copy

**Fix direction:** `ProtectedRoute` should hold the loading spinner until `userRole` is also non-null (when `user` is truthy). Something like:
```tsx
const isLoading = loading || (!!user && userRole === null);
```

---

### BUG-005: `ManagerDashboard` loading state is permanently disabled

**File:** `src/pages/ManagerDashboard.tsx` line 99
**What happens:**
```tsx
const managerLoading = false; // isLoading || orgsLoading - disabled to prevent infinite spinner
```
The loading state was intentionally disabled with a comment. This means:
1. The page renders immediately with no data, showing empty employee tables and blank org names
2. The 15-second timeout/refresh safety net (`loadingTimedOut`) is dead code and will never trigger
3. Users see a flash of empty content before data populates

---

### BUG-006: `TranscriptLibrary` has no header or sign-out for non-manager routes

**File:** `src/pages/TranscriptLibrary.tsx` lines 46–52
**What happens:** The page only renders a "Back to Dashboard" button when the route starts with `/manager`. When accessed via `/transcripts` (individual) or `/team/transcripts` (employee), there is no `<Header />` component, no user info, and no sign-out button. These users are stranded with no top navigation.

**Fix direction:** Add a `<Header />` with sign-out for all route variants, similar to how `TraineePortal` includes it.

---

### BUG-007: `loading` state in TraineePortal never set to `true` — no spinner during initial progress fetch

**File:** `src/pages/TraineePortal.tsx` lines 43, 65–87
**What happens:**
```tsx
const [loading, setLoading] = useState(false); // initialized false
// fetchProgress only ever calls setLoading(false) in finally — never setLoading(true)
```
The loading check at line 309 (`if (loading || curriculumLoading)`) relies on `loading`, but since `loading` never becomes `true`, the full-page spinner never shows for the progress fetch. If `curriculumLoading` is also already `false`, the page renders with empty progress state until `fetchProgress` resolves, causing a flash of zeroed-out stats.

**Fix direction:** Add `setLoading(true)` at the top of `fetchProgress` before the try block.

---

## P2 — Visual Glitches / Minor Issues

### BUG-008: DayContent reading progress bar renders `NaN%` if a day has no readings

**File:** `src/components/DayContent.tsx` line 386
**What happens:**
```tsx
style={{ width: `${(completedReadingsCount / mergedReadings.length) * 100}%` }}
```
If `mergedReadings.length === 0` (a day configured with no reading content), this is `0 / 0 = NaN`, producing `width: NaN%`. The progress bar disappears entirely. Same issue applies to the tasks progress bar at line 431 (`day.tasks.length` could be 0).

**Fix direction:**
```tsx
const readingPct = mergedReadings.length > 0
  ? (completedReadingsCount / mergedReadings.length) * 100
  : 0;
```

---

### BUG-009: `calculateQuizScore` called three times redundantly in quiz results view

**File:** `src/components/DayContent.tsx` lines 489, 493, 499
**What happens:** The quiz results section calls `calculateQuizScore()` three separate times in a single render. Each call iterates through all quiz questions. This is wasteful and could cause inconsistent rendering if state changes between calls (unlikely in practice but bad pattern).

**Fix direction:** Call once and store in a variable: `const score = calculateQuizScore();`

---

### BUG-010: `OnboardingWelcome` falls back to a generic storage key when `user` is null

**File:** `src/components/OnboardingWelcome.tsx` line 99
**What happens:**
```tsx
const resolvedStorageKey = storageKey || `onboarding_seen_${userRole}`;
```
If `storageKey` is undefined (passed from `TraineePortal` when `user` is null), this falls back to `onboarding_seen_null`. If a user dismisses the modal while `user` is temporarily null (race condition), `localStorage` gets the key `onboarding_seen_null`. On next visit as a real user, the per-user `storageKey` is different, so the modal shows again correctly — but the `onboarding_seen_null` key permanently pollutes localStorage.

---

### BUG-011: `ManagerDashboard` org fetch re-runs every time `selectedOrgId` changes

**File:** `src/pages/ManagerDashboard.tsx` lines 48–62
**What happens:**
```tsx
useEffect(() => {
  if (!isSuperAdmin) return;
  // fetches ALL orgs and conditionally sets selectedOrgId
  ...
}, [isSuperAdmin, selectedOrgId]); // ← selectedOrgId is set inside this effect
```
Every time a super admin selects a different org, the effect re-fires and re-fetches the full organizations list from Supabase unnecessarily.

**Fix direction:** Remove `selectedOrgId` from the dependency array. The effect only needs to run when `isSuperAdmin` changes (i.e., on mount).

---

## Summary Table

| Bug | Severity | Page/Component | Impact |
|-----|----------|----------------|--------|
| BUG-001 Chapter completion notifications on load | P0 | TraineePortal | False email/notifications to managers every page load |
| BUG-002 fetchChatSessions not filtered by program | P0 | TraineePortal | Wrong completion state and scores for multi-program users |
| BUG-003 Transcripts button → redirect loop for managers | P1 | TraineePortal | Managers can't access transcripts from training page |
| BUG-004 userRole race condition | P1 | ProtectedRoute + all pages | Wrong UI briefly on every page load |
| BUG-005 ManagerDashboard loading state disabled | P1 | ManagerDashboard | Empty flash, dead safety net code |
| BUG-006 No header/nav on non-manager transcript routes | P1 | TranscriptLibrary | No sign-out for individual/employee transcript users |
| BUG-007 TraineePortal loading never set to true | P1 | TraineePortal | No spinner during progress fetch |
| BUG-008 Progress bar NaN% on empty days | P2 | DayContent | Visual glitch if day has no readings/tasks |
| BUG-009 calculateQuizScore called 3x per render | P2 | DayContent | Minor performance waste |
| BUG-010 OnboardingWelcome generic storage key fallback | P2 | OnboardingWelcome | localStorage pollution |
| BUG-011 Org list re-fetches on every org selection | P2 | ManagerDashboard | Unnecessary Supabase calls |
