# هيكل قاعدة البيانات وقواعد الأمان | Firestore Schema

تستخدم المنصة قاعدة **Cloud Firestore** مع قواعد أمان صفرية الثقة (`firestore.rules`) ومخطط هيكلي موثق في `firebase-blueprint.json`.

---

## المجموعات (Collections)

### 1. `users/{uid}` (بيانات خاصة محمية PII)
- الحقول: `uid`, `fullName`, `email`, `role` (`ADMIN | SUPERVISOR | WORKER | PENDING`), `isActive`, `createdAt`, `updatedAt`.
- **الأمان**: لا يُسمح لأي مستخدم بتعيين دور `ADMIN` أو `SUPERVISOR` لنفسه. التسجيل الجديد يأخذ `PENDING` و`isActive: false` باستثناء البريد الأساسي المُهيأ إدارياً (`BOOTSTRAP_ADMIN_EMAIL`) بعد التحقق من `email_verified == true`.

### 2. `staffDirectory/{uid}`
- الحقول: `uid`, `fullName`, `role`, `isActive`, `updatedAt` (بدون أي بريد إلكتروني أو هاتف لحماية الخصوصية).

### 3. `parks/{parkId}`
- الحقول: `id`, `name`, `description`, `location`, `status`, `createdAt`, `updatedAt`.

### 4. `bins/{binId}`
- الحقول: `id`, `parkId`, `name`, `binType`, `capacityLiters`, `status`, `currentFillPercentage`, `lastDistanceCm`, `emptyDistanceCm`, `fullDistanceCm`, `lastReadingAt`, `lastReadingSource`, `deviceId`, `locationDescription`, `createdAt`, `updatedAt`.

### 5. `devices/{deviceId}`
- الحقول: `id`, `name`, `deviceType`, `sensorModel`, `binId`, `parkId`, `connectionStatus` (`ONLINE | OFFLINE | NEVER_CONNECTED`), `firmwareVersion`, `lastSeenAt`, `lastSignalStrength`, `lastSequenceNumber`, `reportingIntervalSeconds`, `isActive`, `createdAt`, `updatedAt`.
- **ملاحظة أمنية**: لا يُخزن أي رمز مصادقة خام أو مهشّر داخل `devices`.

### 6. `deviceCredentials/{deviceId}` (مجموعة خادم فقط)
- الحقول: `deviceId`, `tokenHash` (SHA-256), `tokenPrefix`, `isRevoked`, `rotatedAt`, `revokedAt`.
- **الأمان**: مقفلة كلياً في `firestore.rules` (`allow read, write: if false;`) ولا يصل إليها إلا الخادم الخلفي.

### 7. `sensorReadings/{readingId}`
- الحقول: `id`, `deviceId`, `binId`, `distanceCm`, `fillPercentage`, `signalStrength`, `sequenceNumber`, `measuredAt`, `receivedAt`, `source` (`HARDWARE | DEMO`), `qualityStatus` (`VALID | FILTERED | OUT_OF_RANGE | INVALID`).

### 8. `alerts/{alertId}`
- الحقول: `id`, `binId`, `deviceId`, `type` (`BIN_80_PERCENT | BIN_FULL | DEVICE_OFFLINE | SENSOR_ERROR | SENSOR_READING_INVALID`), `severity`, `message`, `status` (`ACTIVE | ACKNOWLEDGED | RESOLVED`), `source`, `createdAt`, `acknowledgedAt`, `acknowledgedBy`, `resolvedAt`.

### 9. `citizenReports/{reportId}`
- الحقول: `id`, `parkId`, `reportType`, `title`, `description`, `locationDescription`, `imageUrl`, `reporterName`, `reporterContact`, `status`, `priority`, `createdAt`, `updatedAt`.
- **الأمان**: تُنشأ عبر نقطة نهاية الخادم المحمية بمحدد المعدل، ويقرأها المشرف والمدير فقط.

### 10. `maintenanceTasks/{taskId}`
- الحقول: `id`, `reportId`, `parkId`, `binId`, `assignedTo`, `title`, `description`, `completionNotes`, `priority`, `status` (`PENDING | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED`), `createdAt`, `updatedAt`, `completedAt`.

### 11. `systemConfig/{configId}`
- الحقول: `id`, `operatingMode` (`DEMO | HARDWARE`), `warningThresholdPercent`, `criticalThresholdPercent`, `defaultReportingIntervalSeconds`, `offlineTimeoutSeconds`, `defaultEmptyDistanceCm`, `defaultFullDistanceCm`, `updatedAt`, `updatedBy`.

### 12. `auditLogs/{logId}`
- سجل غير قابل للتعديل من المتصفح لتتبع العمليات الإدارية الحساسة دون حفظ أي كلمات مرور أو رموز سرية.
