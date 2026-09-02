'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  removeAvatarAction,
  uploadAvatarAction,
  uploadVenueCoverAction,
  type UploadState,
} from '@/lib/actions/uploads';
import { Alert, Button } from '@/components/ui/primitives';
import { t } from '@/i18n';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? t.upload.uploading : label}
    </Button>
  );
}

/**
 * The file input is kept controlled enough to show the chosen filename and to
 * disable the submit button until something is actually selected — a submit
 * that can only fail is worse than no submit at all.
 */
function FilePicker({
  id,
  onPick,
  hint,
}: {
  id: string;
  onPick: (name: string | null) => void;
  hint: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50 focus-within:ring-2 focus-within:ring-brand-500 dark:border-white/15 dark:text-ink-200 dark:hover:bg-white/10"
      >
        {t.upload.choose}
        <input
          id={id}
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => onPick(event.target.files?.[0]?.name ?? null)}
        />
      </label>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
    </div>
  );
}

export function AvatarUpload({
  currentUrl,
  displayName,
}: {
  currentUrl: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<UploadState | null, FormData>(
    uploadAvatarAction,
    null,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const url = state?.url ?? currentUrl;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-ink-900 dark:text-white">{t.upload.avatarTitle}</h2>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex items-center gap-4">
        <AvatarImage url={url} displayName={displayName} size={72} />

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col gap-2"
          onSubmit={() => setPicked(null)}
        >
          <FilePicker id="avatar-file" onPick={setPicked} hint={t.upload.avatarHint} />
          {picked ? (
            <p className="truncate text-xs text-ink-600 dark:text-ink-300">{picked}</p>
          ) : null}
          <div className="flex gap-2">
            {picked ? <SubmitButton label={t.upload.save} /> : null}
            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={async () => {
                  setRemoving(true);
                  await removeAvatarAction();
                  setRemoving(false);
                  formRef.current?.reset();
                  setPicked(null);
                  router.refresh();
                }}
              >
                {removing ? t.common.loading : t.upload.remove}
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export function VenueCoverUpload({
  venueId,
  currentUrl,
  venueName,
}: {
  venueId: string;
  currentUrl: string | null;
  venueName: string;
}) {
  const [state, formAction] = useActionState<UploadState | null, FormData>(
    uploadVenueCoverAction,
    null,
  );
  const [picked, setPicked] = useState<string | null>(null);

  const url = state?.url ?? currentUrl;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-ink-900 dark:text-white">{t.upload.venueCoverTitle}</h3>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      {url ? (
        <div className="relative aspect-[16/9] w-full max-w-sm overflow-hidden rounded-xl border border-ink-200 dark:border-white/10">
          <Image
            src={url}
            alt={venueName}
            fill
            sizes="(max-width: 640px) 100vw, 384px"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="grid aspect-[16/9] w-full max-w-sm place-items-center rounded-xl border border-dashed border-ink-300 text-sm text-ink-500 dark:border-white/15 dark:text-ink-400">
          {t.upload.noVenueImage}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-2" onSubmit={() => setPicked(null)}>
        <input type="hidden" name="venueId" value={venueId} />
        <FilePicker id={`venue-cover-${venueId}`} onPick={setPicked} hint={t.upload.venueHint} />
        {picked ? <p className="truncate text-xs text-ink-600 dark:text-ink-300">{picked}</p> : null}
        {picked ? <div><SubmitButton label={t.upload.save} /></div> : null}
      </form>
    </div>
  );
}

/** Shared avatar renderer: a real image when there is one, initials otherwise. */
export function AvatarImage({
  url,
  displayName,
  size = 32,
}: {
  url: string | null;
  displayName: string;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt={displayName}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size / 2.6)) }}
    >
      {displayName.trim().charAt(0) || '?'}
    </span>
  );
}
