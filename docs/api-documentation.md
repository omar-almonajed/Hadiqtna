# توثيق واجهة برمجة التطبيقات | REST API Documentation

جميع الطلبات المحمية تتطلب ترويسة مصادقة:
- **للموظفين**: `Authorization: Bearer <FIREBASE_ID_TOKEN>`
- **لأجهزة ESP32**: `Authorization: Bearer <PROVISIONED_DEVICE_TOKEN>`

---

## 1. فحص الجاهزية
### `GET /api/health`
الاستجابة:
```json
{
  "ok": true,
  "service": "hadiqtna-api",
  "databaseConnected": true,
  "firestoreAdminConnected": true,
  "persistenceMode": "CLOUD_FIRESTORE",
  "timestamp": "2026-11-14T12:00:00.000Z"
}
```

---

## 2. استقبال قراءة من ESP32
### `POST /api/iot/readings`
**الترويسة المطلوبة**: `Authorization: Bearer hq_dev_...`

**الطلب**:
```json
{
  "deviceId": "BIN-ESP32-001",
  "sequenceNumber": 125,
  "distanceCm": 24.5,
  "signalStrength": -61,
  "measuredAt": "2026-11-14T12:00:00.000Z"
}
```

**الاستجابة الناجحة (`201 Created`)**:
```json
{
  "success": true,
  "deviceId": "BIN-ESP32-001",
  "binId": "bin-nakheel-01",
  "fillPercentage": 87,
  "alertTriggered": true,
  "receivedAt": "2026-11-14T12:00:01.120Z"
}
```

**حالات الخطأ الموثقة**:
- `401 Unauthorized`: رمز الجهاز مفقود، خاطئ، أو تم إلغاؤه (`revoke`).
- `403 Forbidden`: الجهاز معطّل (`isActive: false`) أو `deviceId` لا يطابق الرمز.
- `409 Conflict`: رقم تسلسل مكرر أو أقدم من آخر تسلسل مقبول (`DUPLICATE_SEQUENCE`).
- `422 Unprocessable Entity`: قراءة مسافة سالبة أو خارج المدى الفيزيائي للحساس.

---

## 3. إدارة الأجهزة والحاويات والتنبيهات
| المسار | الطريقة | الصلاحية | الوصف |
|--------|---------|----------|-------|
| `/api/iot/devices` | `GET` | ADMIN, SUPERVISOR | قائمة الأجهزة وحالة الاتصال |
| `/api/iot/devices/:deviceId` | `GET` | ADMIN, SUPERVISOR | تفاصيل جهاز محدد |
| `/api/iot/devices` | `POST` | ADMIN | تسجيل جهاز وإصدار الرمز لمرة واحدة |
| `/api/iot/devices/:deviceId/rotate-token` | `POST` | ADMIN | تدوير الرمز وإصدار رمز جديد |
| `/api/iot/devices/:deviceId/revoke` | `POST` | ADMIN | إلغاء صلاحية الجهاز فوراً |
| `/api/iot/bins` | `GET` | STAFF | قائمة الحاويات الذكية |
| `/api/iot/bins/:binId` | `GET` | STAFF | تفاصيل حاوية محددة |
| `/api/iot/bins/:binId/readings` | `GET` | ADMIN, SUPERVISOR | سجل قراءات الحاوية |
| `/api/iot/bins/:binId/empty` | `POST` | STAFF | تسجيل تفريغ يدوي للحاوية |
| `/api/iot/alerts` | `GET` | ADMIN, SUPERVISOR | قائمة التنبيهات |
| `/api/iot/alerts/:alertId/acknowledge` | `POST` | ADMIN, SUPERVISOR | الإقرار بالتنبيه |
| `/api/iot/alerts/:alertId/resolve` | `POST` | ADMIN, SUPERVISOR | إغلاق التنبيه |

---

## 4. بوابة المواطنين والصيانة والإعدادات
- `GET /api/parks/public`: قائمة الحدائق المتاحة للبلاغات العامة.
- `POST /api/reports`: إرسال بلاغ مواطن (`multipart/form-data` مع صورة اختيارية حتى 2MB).
- `GET /api/reports` | `PATCH /api/reports/:reportId` | `POST /api/reports/:reportId/convert`: إدارة البلاغات وتحويلها لمهام صيانة.
- `GET /api/maintenance` | `POST /api/maintenance` | `PATCH /api/maintenance/:taskId`: إدارة وتنفيذ مهام الصيانة.
- `GET /api/analytics` | `GET /api/settings` | `PATCH /api/settings` | `GET /api/users` | `PATCH /api/users/:uid`.
- `POST /api/iot/demo/simulate`: محاكاة قراءة في وضع `DEMO` فقط.
