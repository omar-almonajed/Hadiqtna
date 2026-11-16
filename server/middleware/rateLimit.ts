import rateLimit from 'express-rate-limit';

export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً.',
  },
});

export const iotIngestionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'IOT_RATE_LIMIT',
    message: 'تم تجاوز معدل إرسال القراءات المسموح للجهاز.',
  },
});

export const citizenReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'REPORT_RATE_LIMIT',
    message: 'تم إرسال عدة بلاغات مؤخراً، يرجى الانتظار قليلاً قبل إرسال بلاغ جديد.',
  },
});

export const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'AUTH_RATE_LIMIT',
    message: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح، يرجى الانتظار قبل المحاولة مجدداً.',
  },
});

