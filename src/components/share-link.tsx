'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/primitives';
import { lineShareUrl } from '@/lib/line/share';
import { t } from '@/i18n';

/**
 * The shareable link is the product's distribution mechanism, so it is a
 * first-class element rather than a hidden menu item. The LINE share endpoint
 * needs no channel configuration, so this works from day one.
 */
export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the input below stays selectable as a fallback.
      setCopied(false);
    }
  }

  return (
    <Card className="px-4 py-4">
      <p className="text-sm font-semibold text-ink-900 dark:text-white">แชร์ก๊วนนี้</p>
      <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
        ส่งลิงก์เดียวเข้ากลุ่ม เพื่อนกดเข้าร่วมได้ทันที
      </p>

      <input
        readOnly
        value={url}
        aria-label="ลิงก์ก๊วน"
        onFocus={(event) => event.currentTarget.select()}
        className="mt-3 w-full rounded-lg border border-ink-200 bg-ink-50 px-2 py-1.5 font-mono text-xs text-ink-700 dark:border-white/10 dark:bg-white/5 dark:text-ink-200"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!url}
          className="flex-1 rounded-lg border border-ink-300 px-3 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50 focus-ring dark:border-white/15 dark:text-ink-200 dark:hover:bg-white/10"
        >
          {copied ? t.common.copied : t.common.copyLink}
        </button>
        {url ? (
          <a
            href={lineShareUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg bg-[#06C755] px-3 py-2 text-center text-xs font-semibold text-white transition hover:brightness-95 focus-ring"
          >
            {t.common.shareToLine}
          </a>
        ) : null}
      </div>
    </Card>
  );
}
