import { useEffect, useState } from 'react';
import { getActiveSessionToken } from '../../services/apiClient';

interface StaffAuthImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Loads protected staff images (citizen report uploads & after-maintenance photos)
 * using the active Bearer session token so browser <img> requests remain authenticated.
 */
export function StaffAuthImage({ src, alt, className = 'w-full max-h-56 object-cover' }: StaffAuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    if (!src) return;

    (async () => {
      try {
        const token = await getActiveSessionToken();
        const res = await fetch(src, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <div className="flex items-center justify-center bg-stone-100 border border-[#E2E6E1] rounded-lg p-4 text-xs text-stone-500">
        {alt}
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="animate-pulse bg-stone-100 border border-[#E2E6E1] rounded-lg h-36 w-full" />
    );
  }

  return <img src={objectUrl} alt={alt} className={className} referrerPolicy="no-referrer" />;
}
