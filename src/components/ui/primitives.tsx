import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: ElementType;
}) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-ink-200/70 bg-white shadow-sm',
        'dark:border-white/10 dark:bg-white/[0.03]',
        className,
      )}
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
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>
        ) : null}
        <h1 className="text-xl font-bold text-ink-900 sm:text-2xl dark:text-white">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{description}</p>
        ) : null}
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
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="font-semibold text-ink-800 dark:text-ink-100">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">{description}</p>
      ) : null}
      {action}
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-ring disabled:cursor-not-allowed disabled:opacity-50';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'border border-ink-300 bg-white text-ink-800 hover:bg-ink-50 dark:border-white/15 dark:bg-white/5 dark:text-ink-100 dark:hover:bg-white/10',
  ghost: 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
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
}: ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
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
 * A control that cannot act right now. Rendered disabled with the reason
 * attached, rather than as a live button that quietly does nothing.
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
    <div className={cn('flex flex-col gap-1', className)}>
      <button type="button" disabled title={reason} className={buttonClass('secondary', size)}>
        {label}
      </button>
      <p className="text-xs text-ink-500 dark:text-ink-400">{reason}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Status
 * ---------------------------------------------------------------------- */

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

const chipTones: Record<ChipTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
  success: 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  danger: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200',
  brand: 'bg-brand-600 text-white',
};

export function Chip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        chipTones[tone],
        className,
      )}
    >
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

  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-baseline justify-between text-xs text-ink-600 dark:text-ink-300">
          <span>{label}</span>
          <span className="font-semibold tabular-nums">
            {value}/{max}
          </span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            tone === 'brand' ? 'bg-brand-500' : 'bg-accent-500',
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
  const tones = {
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
    success:
      'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100',
    warning:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    danger:
      'border-red-300 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
  } as const;

  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone])} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
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
    <Card className="px-4 py-3">
      <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-bold tabular-nums',
          tone === 'positive' && 'text-brand-700 dark:text-brand-300',
          tone === 'negative' && 'text-red-700 dark:text-red-300',
          (!tone || tone === 'default') && 'text-ink-900 dark:text-white',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p> : null}
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
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-800 dark:text-ink-100">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = cn(
  'w-full rounded-xl border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900',
  'placeholder:text-ink-400 focus-ring',
  'dark:border-white/15 dark:bg-white/5 dark:text-white',
);

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn(inputClass, 'pr-8', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(inputClass, 'min-h-24', className)} {...props} />;
}
