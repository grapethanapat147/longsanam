import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/* =========================================================================
 * Court Lines — the shared vocabulary.
 *
 * Every screen in this product answers one question: what is the state of my
 * session, and what can I do about it. So status and action are the two things
 * these primitives are tuned to make unmissable; everything else recedes.
 * ====================================================================== */

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

export function Card({
  className,
  children,
  as: Tag = 'div',
  /** Marks the focal element of a screen with painted court corners. */
  focal = false,
  style,
}: {
  className?: string;
  children: ReactNode;
  as?: ElementType;
  focal?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border hairline bg-white shadow-line',
        focal && 'court-tick shadow-lift',
        className,
      )}
      style={style}
    >
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-brand-600">
            {/* A short painted rule instead of a bullet. */}
            <span aria-hidden className="h-px w-5 bg-brand-400" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[1.6rem] font-semibold leading-tight text-ink-900 sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1.5 text-sm text-ink-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-2xl">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

/* A 1px downward nudge on press: the whole feedback budget goes here, where a
   thumb expects it, rather than into decorative motion elsewhere. */
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight ' +
  'transition-[background-color,box-shadow,transform] duration-150 focus-ring ' +
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-line hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border hairline bg-white text-ink-800 shadow-line hover:bg-ink-50 active:bg-ink-100',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-clay-700 text-white shadow-line hover:bg-clay-900',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/**
 * A control that cannot act right now. Rendered genuinely disabled with the
 * reason attached, rather than as a live button that quietly does nothing.
 */
export function DisabledAction({
  label,
  reason,
  size = 'md',
  className,
}: {
  label: string;
  reason: string;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <button type="button" disabled title={reason} className={buttonClass('secondary', size)}>
        {label}
      </button>
      <p className="text-xs leading-relaxed text-ink-500">{reason}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Status
 * ---------------------------------------------------------------------- */

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

/* Each tone pairs a tinted surface with a saturated dot. The dot does the
   scanning work — colour-blind readers and anyone glancing at a phone in
   sunlight get position and label, not hue alone. */
const chipTones: Record<ChipTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-ink-100 text-ink-700', dot: 'bg-ink-400' },
  info: { chip: 'bg-sky-50 text-sky-900', dot: 'bg-sky-500' },
  success: { chip: 'bg-brand-50 text-brand-800', dot: 'bg-brand-500' },
  warning: { chip: 'bg-clay-50 text-clay-900', dot: 'bg-clay-500' },
  danger: { chip: 'bg-red-50 text-red-900', dot: 'bg-red-500' },
  brand: { chip: 'bg-brand-600 text-white', dot: 'bg-accent-400' },
};

export function Chip({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  /** Adds the leading status dot. On for status, off for plain metadata. */
  dot?: boolean;
}) {
  const style = chipTones[tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        style.chip,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', style.dot)} /> : null}
      {children}
    </span>
  );
}

export function Progress({
  value,
  max,
  label,
  tone = 'brand',
}: {
  value: number;
  max: number;
  label?: string;
  tone?: 'brand' | 'accent';
}) {
  const safeMax = Math.max(1, max);
  const percent = Math.min(100, Math.round((value / safeMax) * 100));
  const complete = value >= max;

  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-600">
          <span className="truncate">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums text-ink-800">
            {value}
            <span className="text-ink-400">/{max}</span>
          </span>
        </div>
      ) : null}
      {/* Squared ends and a track hairline: a painted line on a court, not a
          rounded capsule. Lime fill when full, so "we have enough players"
          registers before the number is read. */}
      <div
        className="h-2 w-full overflow-hidden rounded-sm bg-ink-200/70 ring-1 ring-inset ring-[var(--hairline)]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            'grow-x h-full rounded-sm transition-[width] duration-500 ease-out',
            complete ? 'bg-accent-500' : tone === 'brand' ? 'bg-brand-500' : 'bg-accent-500',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Feedback
 * ---------------------------------------------------------------------- */

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  /* A 3px painted edge on the leading side carries the tone, so the fill can
     stay pale enough for body text to hold contrast. */
  const tones = {
    info: 'border-l-sky-500 bg-sky-50/70 text-sky-950',
    success: 'border-l-brand-500 bg-brand-50/70 text-brand-900',
    warning: 'border-l-clay-500 bg-clay-50/80 text-clay-900',
    danger: 'border-l-red-500 bg-red-50/70 text-red-950',
  } as const;

  return (
    <div
      className={cn(
        'rounded-r-xl rounded-l-sm border border-l-[3px] hairline px-4 py-3 text-sm leading-relaxed',
        tones[tone],
      )}
      role="status"
    >
      {title ? <p className="font-display font-semibold">{title}</p> : null}
      <div className={title ? 'mt-0.5' : undefined}>{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </p>
      <p
        className={cn(
          'font-display mt-1 text-xl font-semibold tabular-nums tracking-tight',
          tone === 'positive' && 'text-brand-700',
          tone === 'negative' && 'text-clay-700',
          (!tone || tone === 'default') && 'text-ink-900',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs leading-snug text-ink-500">{hint}</p> : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * Forms
 * ---------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-clay-500" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-clay-700">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = cn(
  'w-full rounded-xl border hairline bg-white px-3 py-2.5 text-sm text-ink-900',
  'shadow-[inset_0_1px_2px_0_rgb(18_33_28_/_0.04)]',
  'placeholder:text-ink-400 focus-ring',
  'transition-colors hover:border-ink-300',
);

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn(inputClass, 'pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(inputClass, 'min-h-24 leading-relaxed', className)} {...props} />;
}
