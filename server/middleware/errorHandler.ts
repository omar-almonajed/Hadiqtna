import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ServiceError } from '../services/iotService.ts';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ServiceError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'البيانات المرسلة غير مكتملة أو غير صالحة.',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({
      success: false,
      error: 'FILE_UPLOAD_ERROR',
      message:
        err.code === 'LIMIT_FILE_SIZE'
          ? 'حجم الصورة يتجاوز الحد الأقصى المسموح (2 ميجابايت).'
          : 'فشل رفع الملف المرفق.',
    });
    return;
  }

  if (err instanceof Error && err.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({
      success: false,
      error: 'INVALID_FILE_TYPE',
      message: 'يُسمح فقط برفع صور بصيغة PNG أو JPEG أو WebP.',
    });
    return;
  }

  console.error('[Hadiqtna API Error]', err instanceof Error ? err.message : String(err));
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'حدث خطأ داخلي في الخادم.',
  });
}
