import { useState } from 'react';

/** Must match server default when copy cannot be scraped (see adsController.js). */
const UNAVAILABLE_COPY = 'Content currently unavailable';

const PLATFORM_STYLES = {
  facebook: {
    label: 'Facebook',
    className:
      'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200/80 shadow-sm',
  },
  instagram: {
    label: 'Instagram',
    className:
      'bg-gradient-to-br from-fuchsia-50 to-pink-50 text-pink-900 ring-1 ring-inset ring-pink-200/80 shadow-sm',
  },
  twitter: {
    label: 'Twitter',
    className: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200/80',
  },
  google: {
    label: 'Google',
    className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/80',
  },
  tiktok: {
    label: 'TikTok',
    className: 'bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-200/80',
  },
  other: {
    label: 'Audience Network',
    className: 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200/80 shadow-sm',
  },
  messenger: {
    label: 'Messenger',
    className: 'bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200/80 shadow-sm',
  },
};

function isMissingOrUnavailableCopy(text) {
  if (text == null || !String(text).trim()) return true;
  const t = String(text).trim();
  return (
    t === UNAVAILABLE_COPY ||
    t === '(No ad text)' ||
    /^no ad text$/i.test(t)
  );
}

function CreativePlaceholder() {
  return (
    <div
      className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-400"
      role="img"
      aria-label="No ad creative preview available"
    >
      <div className="rounded-2xl border border-slate-200/80 bg-white/60 p-4 shadow-sm">
        <svg className="h-14 w-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      </div>
      <p className="px-4 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
        No preview image
      </p>
    </div>
  );
}

const AdCard = ({ ad }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(ad.imageUrl) && !imageFailed;
  const platformKeys = Array.isArray(ad.platforms) && ad.platforms.length
    ? ad.platforms
    : [ad.platform || 'other'];
  const showUnavailableCopy = isMissingOrUnavailableCopy(ad.text);
  const isBlueVerified = ad.pageVerification === 'BLUE_VERIFIED';

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-md ring-1 ring-black/[0.03] transition-shadow hover:shadow-lg">
      <header className="border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/80 px-5 py-4 min-h-[92px]">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Advertiser</p>
        </div>
        <div className="mt-1.5 flex min-w-0 items-start gap-1.5">
          <h2 className="min-w-0 text-lg font-semibold leading-tight tracking-tight text-gray-900 break-words">
            {ad.brandName}
          </h2>
          {isBlueVerified && (
            <span
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
              title="Blue verified page"
              aria-label="Blue verified page"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42-.006L3.3 9.11a1 1 0 1 1 1.4-1.428l4.08 3.999 6.5-6.39a1 1 0 0 1 1.424 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {platformKeys.map((platform) => {
            const key = PLATFORM_STYLES[platform] ? platform : 'other';
            const { label, className } = PLATFORM_STYLES[key];
            return (
              <span
                key={`${ad._id || ad.brandName}-${platform}`}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ${className}`}
              >
                {label}
              </span>
            );
          })}
        </div>
      </header>

      <div className="relative aspect-[4/3] w-full min-h-[200px] overflow-hidden bg-gray-950/[0.04]">
        {hasImage ? (
          <img
            src={ad.imageUrl}
            alt={`Ad creative preview for ${ad.brandName}`}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
            loading="lazy"
          />
        ) : (
          <CreativePlaceholder />
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Ad copy</p>
        {showUnavailableCopy ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center">
            <p className="text-sm font-medium leading-relaxed text-gray-500">{UNAVAILABLE_COPY}</p>
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed text-gray-700 line-clamp-6">{ad.text}</p>
        )}
      </div>
    </article>
  );
};

export default AdCard;
