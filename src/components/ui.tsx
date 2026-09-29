import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../lib/errors'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-surface text-ink border border-line hover:bg-bg disabled:text-muted',
  ghost: 'text-brand hover:bg-brand-soft disabled:text-muted',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  accent: 'bg-accent text-ink hover:opacity-90 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

export function LinkButton({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition active:scale-[0.98] ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Laddar"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-brand'}`}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-surface p-4 shadow-sm ${className}`}>{children}</div>
}

export function ErrorBox({ error, className = '' }: { error: unknown; className?: string }) {
  if (!error) return null
  return (
    <div role="alert" className={`rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger ${className}`}>
      {typeof error === 'string' ? error : errorMessage(error)}
    </div>
  )
}

export function Notice({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'warn' | 'good'; className?: string }) {
  const tones = {
    info: 'bg-brand-soft text-brand-dark',
    warn: 'bg-accent-soft text-ink',
    good: 'bg-brand-soft text-brand-dark',
  }
  return <div className={`rounded-2xl px-4 py-3 text-sm ${tones[tone]} ${className}`}>{children}</div>
}

export function Label({ children, htmlFor, optional }: { children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
      {optional && <span className="ml-1 font-normal text-muted">(frivilligt)</span>}
    </label>
  )
}

const fieldClass =
  'w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} appearance-none bg-[length:1rem] ${props.className ?? ''}`} />
}

export function Chip({
  selected,
  onClick,
  children,
  className = '',
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
        selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink hover:border-brand/50'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-5xl" aria-hidden>
        {emoji}
      </div>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="text-sm text-muted">{children}</div>
    </div>
  )
}

export function PageHeader({ title, back, right }: { title: string; back?: string | (() => void); right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
      {back &&
        (typeof back === 'string' ? (
          <Link to={back} className="-ml-2 rounded-full p-2 text-xl text-brand" aria-label="Tillbaka">
            ←
          </Link>
        ) : (
          <button onClick={back} className="-ml-2 rounded-full p-2 text-xl text-brand" aria-label="Tillbaka">
            ←
          </button>
        ))}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {right}
    </header>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'accent' | 'danger' }) {
  const tones = {
    neutral: 'bg-bg text-muted border border-line',
    brand: 'bg-brand-soft text-brand-dark',
    accent: 'bg-accent-soft text-ink',
    danger: 'bg-danger-soft text-danger',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}
