import { useState } from 'react';
import { Utensils } from 'lucide-react';
import { isSafeMediaUrl } from '../utils/format';

interface BulldogLogoProps {
  logoUrl?: string;
  storeName?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BulldogLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#DC2626" />
      <path
        d="M13 18L10 11L18 14C20 13.2 22 13 24 13C26 13 28 13.2 30 14L38 11L35 18C37 20.5 38 23.5 38 27C38 33.5 31.8 38 24 38C16.2 38 10 33.5 10 27C10 23.5 11 20.5 13 18Z"
        fill="#0B0B0E"
      />
      <circle cx="18.5" cy="23.5" r="2.2" fill="#F4F4F5" />
      <circle cx="29.5" cy="23.5" r="2.2" fill="#F4F4F5" />
      <path d="M21 28.5L24 26.5L27 28.5L25.5 31.5H22.5L21 28.5Z" fill="#DC2626" />
      <path
        d="M16.5 33.5C18.8 35.2 21.3 36 24 36C26.7 36 29.2 35.2 31.5 33.5"
        stroke="#F4F4F5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M18.5 34.5V32M29.5 34.5V32" stroke="#F4F4F5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BrandWordmark({
  logoUrl = '/assets/aistudio/logo_bulldog_ae7e998d.jpeg',
  storeName = 'BULLDOG',
  size = 'md',
}: BulldogLogoProps) {
  const [imgError, setImgError] = useState(false);
  const resolvedLogo = logoUrl || '/assets/aistudio/logo_bulldog_ae7e998d.jpeg';
  const hasLogo = isSafeMediaUrl(resolvedLogo) && !imgError;

  const boxSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      {hasLogo ? (
        <span className={`${boxSize} rounded-full overflow-hidden shrink-0 inline-block`}>
          <img
            src={resolvedLogo}
            alt={storeName}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover scale-[1.12]"
          />
        </span>
      ) : (
        <BulldogLogoMark className={boxSize} />
      )}
      <span
        className={`font-display ${textSize} font-extrabold tracking-wide uppercase text-white leading-none`}
      >
        {storeName.toUpperCase().includes('BULLDOG') ? 'BULLDOG' : storeName}
      </span>
    </span>
  );
}

interface SafeFoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function getFoodImagePositionClass(src: string): string {
  if (src.includes('hamburguer_4_pdf_p2')) return 'object-[45%_84%]';
  if (src.includes('hamburguer_3_pdf_p1')) return 'object-[50%_54%]';
  if (src.includes('hamburguer_1_8f1db153')) return 'object-[50%_66%]';
  if (src.includes('hamburguer_2_ace2a5d3')) return 'object-[45%_78%]';
  return 'object-center';
}

export function isPortraitBurgerPhoto(src: string): boolean {
  return (
    src.includes('hamburguer_1_8f1db153') ||
    src.includes('hamburguer_2_ace2a5d3') ||
    src.includes('hamburguer_3_pdf_p1') ||
    src.includes('hamburguer_4_pdf_p2')
  );
}

export function SafeFoodImage({ src, alt, className = '' }: SafeFoodImageProps) {
  const [failed, setFailed] = useState(false);
  const valid = isSafeMediaUrl(src) && !failed;

  if (!valid) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-red-950/30 text-zinc-500 p-4 text-center ${className}`}
      >
        <Utensils className="w-7 h-7 text-red-500/70 mb-1.5" aria-hidden="true" />
        <span className="text-xs font-medium text-zinc-400 line-clamp-2">{alt}</span>
      </div>
    );
  }

  const posClass = getFoodImagePositionClass(src);

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${posClass} ${className}`}
    />
  );
}
