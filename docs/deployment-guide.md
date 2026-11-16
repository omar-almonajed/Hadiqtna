# دليل النشر والإعداد الآمن | Deployment Guide

## 1. إنشاء حساب مدير النظام بأمان (Admin Bootstrap)
- لا يُسمح لأي مستخدم بتعيين دور `ADMIN` لنفسه عبر الواجهة أو Firestore.
- يعتمد الخادم وقواعد `firestore.rules` على متغير البيئة `BOOTSTRAP_ADMIN_EMAIL` (القيمة الافتراضية الحالية هي البريد المعتمد للمشروع مع اشتراط تحقق البريد `email_verified == true`).
- أي مستخدم آخر يسجل دخوله عبر Google يأخذ حالة `PENDING` (`isActive: false`) حتى يقوم المدير بترقيته وتفعيله من صفحة `/settings`.

---

## 2. متغيرات البيئة المطلوبة في الإنتاج (Cloud Run / Production)
راجع `.env.example`:
- `PORT=3000`
- `NODE_ENV=production`
- `APP_URL=https://your-service-url.run.app`
- `CORS_ORIGINS=https://your-service-url.run.app,https://your-custom-domain.example`
- `BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com`
- `FIREBASE_SERVICE_ACCOUNT_KEY`: محتوى JSON لحساب الخدمة (Service Account) الخاص بمشروع Firebase بصيغة نص JSON أو Base64 (مطلوب في الإنتاج لتشغيل `firebase-admin` عبر المشاريع على Cloud Firestore).

> **تحذير أمني**: لا ترفع ملفات `service-account.json` أو `.env` إلى مستودع الكود أبداً؛ استخدم Google Cloud Secret Manager أو لوحة Secrets في Google AI Studio.

---

## 3. نشر قواعد الأمان (Firestore Rules)
```bash
npm run test:rules
firebase deploy --only firestore:rules
```

---

## 4. البناء والتشغيل على Google Cloud Run
```bash
npm install
npm run build
npm start
```
يقوم `npm run build` ببناء الواجهة الأمامية في `dist/`، ويقوم `npm start` (`node server.ts`) بتشغيل خادم Express الموحد مع واجهات `/api/*` وملفات الواجهة على المنفذ `3000`.

---

## 5. ربط نطاق مخصص (Custom Domain)
1. اربط النطاق في لوحة Cloud Run Domain Mappings مع شهادة SSL تلقائية (HTTPS إجباري لأجهزة ESP32).
2. أضف النطاق الجديد إلى قائمة `Authorized domains` في Firebase Authentication.
3. أضف النطاق إلى متغير `CORS_ORIGINS` وحدّث `API_BASE_URL` في `secrets.h` لأجهزة ESP32.
