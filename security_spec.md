# Security Specification — Hadiqtna | حديقتنا

## 1. Data Invariants

1. **Global Default Deny**: Any collection or subcollection not explicitly matched is denied (`read, write: if false`).
2. **Privilege Escalation Prevention**: Users can never self-assign `ADMIN` or `SUPERVISOR` roles on `/users/{userId}` creation or update. Only a verified `ADMIN` (or bootstrapped admin `mralmnjd363@gmail.com` with `email_verified == true`) can alter user roles or `isActive`.
3. **PII Isolation**: `/users/{userId}` contains `email` and is readable (`get`) only by the owner (`request.auth.uid == userId`) or an `ADMIN`. `/citizenReports/{reportId}` contains `reporterName` and `reporterContact` and is readable only by `ADMIN` or `SUPERVISOR` (never by `WORKER` or unauthenticated clients).
4. **Device Secret Isolation**: `/deviceCredentials/{deviceId}` stores `tokenHash` and `tokenPrefix` and is completely inaccessible (`allow read, write: if false`) to all client SDKs; only the backend Admin SDK accesses it.
5. **Authoritative Hardware Data**: Client SDKs can never directly write `HARDWARE`-sourced `/sensorReadings`, modify `deviceCredentials`, or write `/auditLogs`.
6. **Worker Task Scope**: `WORKER` users can only list/read `/maintenanceTasks` assigned to their `uid` (`resource.data.assignedTo == request.auth.uid`), and can only update `status`, `completionNotes`, `completedAt`, and `updatedAt` via an explicit action gate, blocked once `status` reaches terminal state (`COMPLETED` or `CANCELLED`) unless overridden by `ADMIN`.
7. **ID & Boundary Hardening**: Every document ID path variable must match `^[a-zA-Z0-9_-]+$` and `size() <= 128`. All strings enforce strict `size()` limits, and all creates/updates enforce `keys().hasAll(...) && keys().hasOnly(...)` or `affectedKeys().hasOnly(...)` + `request.time` / server timestamp checks.

---

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Target | Attack Vector | Expected Result |
|---|--------|---------------|-----------------|
| 1 | `/users/{uid}` | Self-registration with `role: "ADMIN"` | `PERMISSION_DENIED` |
| 2 | `/users/{uid}` | Existing `WORKER` updates own doc to set `role: "SUPERVISOR"` | `PERMISSION_DENIED` |
| 3 | `/users/{otherUid}` | Non-admin user tries `get` on another user's `/users/{otherUid}` (PII leak) | `PERMISSION_DENIED` |
| 4 | `/users/{uid}` | Spoofed admin email with `email_verified: false` attempts admin write | `PERMISSION_DENIED` |
| 5 | `/deviceCredentials/dev-1` | Signed-in `ADMIN` tries to read `tokenHash` directly from client SDK | `PERMISSION_DENIED` |
| 6 | `/sensorReadings/{id}` | Non-admin client tries to forge a `HARDWARE` reading directly | `PERMISSION_DENIED` |
| 7 | `/maintenanceTasks/{id}` | `WORKER` tries to update a task assigned to another worker | `PERMISSION_DENIED` |
| 8 | `/maintenanceTasks/{id}` | `WORKER` tries to modify `title` or `assignedTo` on their own task (Shadow/Field escalation) | `PERMISSION_DENIED` |
| 9 | `/maintenanceTasks/{id}` | `WORKER` tries to reopen a `COMPLETED` terminal task | `PERMISSION_DENIED` |
| 10 | `/parks/{badId}` | Admin tries to create park with oversized/invalid ID (`../../etc/passwd` or 2KB string) | `PERMISSION_DENIED` |
| 11 | `/citizenReports/{id}` | `WORKER` or anonymous user tries to list `/citizenReports` (PII scraping) | `PERMISSION_DENIED` |
| 12 | `/bins/{id}` | Supervisor updates bin with an extra ghost field (`isHacked: true`) | `PERMISSION_DENIED` |
