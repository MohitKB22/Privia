/** Small shared building blocks: states, chips, icons, panels, controls. */

import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Cpu,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  Home,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pin,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquarePen,
  StickyNote,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { RISK_STYLES } from '@/lib/format';

const ICONS = {
  home: Home,
  chat: MessageSquare,
  workspace: Sparkles,
  activity: Activity,
  files: Folder,
  folder: Folder,
  folderOpen: FolderOpen,
  file: FileText,
  calendar: CalendarDays,
  mail: Mail,
  globe: Globe,
  terminal: Terminal,
  note: StickyNote,
  brain: Brain,
  shield: ShieldCheck,
  settings: Settings,
  mic: Mic,
  send: ArrowUp,
  search: Search,
  lock: Lock,
  check: Check,
  x: X,
  alert: AlertTriangle,
  info: Info,
  trash: Trash2,
  plus: Plus,
  refresh: RefreshCw,
  regenerate: RotateCcw,
  cpu: Cpu,
  cloud: Cloud,
  eye: Eye,
  copy: Copy,
  stop: Square,
  pin: Pin,
  plug: Plug,
  key: KeyRound,
  drive: HardDrive,
  paperclip: Paperclip,
  edit: SquarePen,
  arrowRight: ArrowRight,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  spinner: Loader2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Lucide icons at one stroke weight, so every icon in the app matches. */
export function Icon({
  name,
  className = 'h-4 w-4',
  strokeWidth = 1.75,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  const Component = ICONS[name];
  return <Component className={className} strokeWidth={strokeWidth} aria-hidden />;
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Icon name="spinner" className={`${className} animate-spin text-graphite-500`} />;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  icon,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-graphite-700 px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-graphite-800 text-graphite-500">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-graphite-200">{title}</p>
      {detail ? <p className="mt-1 max-w-md text-sm text-graphite-500">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  code,
  onRetry,
}: {
  title?: string;
  detail?: string;
  code?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-danger">
        <Icon name="alert" className="h-4 w-4" />
        {title}
      </p>
      {detail ? <p className="mt-1 text-graphite-300">{detail}</p> : null}
      {code ? <p className="mt-2 font-mono text-2xs text-graphite-500">{code}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-ghost mt-3">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'caution';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles =
    tone === 'caution'
      ? 'border-caution/30 bg-caution-soft text-caution'
      : 'border-graphite-700 bg-graphite-850 text-graphite-400';
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <Icon name={tone === 'caution' ? 'alert' : 'info'} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={title ? 'mt-0.5 text-graphite-300' : 'text-graphite-300'}>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function RiskChip({ level }: { level: string }) {
  return <span className={`chip ${RISK_STYLES[level] ?? RISK_STYLES.low}`}>{level}</span>;
}

export type Tone = 'neutral' | 'brand' | 'ok' | 'danger' | 'caution' | 'accent';

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const tones: Record<Tone, string> = {
    neutral: 'border-graphite-700 text-graphite-400',
    brand: 'border-brand-line bg-brand-soft text-graphite-100',
    accent: 'border-brand-line bg-brand-soft text-graphite-100',
    ok: 'border-ok/30 bg-ok-soft text-ok',
    danger: 'border-danger/40 bg-danger-soft text-danger',
    caution: 'border-caution/40 bg-caution-soft text-caution',
  };
  return (
    <span className={`chip ${tones[tone]}`} title={title}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'idle' | 'brand' }) {
  const tones = {
    ok: 'bg-ok',
    warn: 'bg-caution',
    bad: 'bg-danger',
    idle: 'bg-graphite-600',
    brand: 'bg-brand',
  };
  return (
    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tones[tone]}`} aria-hidden />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** The standard page body: max width, padding, optional intro line. */
export function Page({
  children,
  intro,
  actions,
  width = 'max-w-5xl',
}: {
  children: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  width?: string;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto ${width} space-y-5 px-8 py-7`}>
        {intro || actions ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            {intro ? <p className="max-w-2xl text-sm text-graphite-400">{intro}</p> : <span />}
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  padded = true,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={`panel ${padded ? 'p-5' : ''}`}>
      <header
        className={`flex items-start justify-between gap-4 ${padded ? 'mb-4' : 'px-5 pb-3 pt-5'}`}
      >
        <div>
          <h2 className="text-sm font-semibold text-graphite-100">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-graphite-500">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  tone = 'brand',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  tone?: 'brand' | 'accent' | 'caution';
}) {
  const on = tone === 'caution' ? 'bg-caution' : 'bg-brand';
  return (
    <label
      className={`flex items-start justify-between gap-6 py-3 ${disabled ? 'opacity-50' : ''}`}
    >
      <span className="min-w-0">
        <span className="block text-sm text-graphite-200">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm text-graphite-500">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? on : 'bg-graphite-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-graphite-100 shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

/** A small segmented control, e.g. Day / Week. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-graphite-700 bg-graphite-900 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-graphite-800 text-graphite-100'
                : 'text-graphite-500 hover:text-graphite-200'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The PRIVIA mark, drawn inline so it needs no asset request. */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="100 100 824 824" className={className} role="img" aria-label="PRIVIA">
      <rect
        x="100"
        y="100"
        width="824"
        height="824"
        rx="186"
        fill="#151619"
        stroke="#303034"
        strokeWidth="10"
      />
      <circle cx="528" cy="420" r="158" fill="none" stroke="#F4F4F5" strokeWidth="64" />
      <rect x="338" y="262" width="64" height="538" rx="32" fill="#F4F4F5" />
      <circle cx="528" cy="420" r="62" fill="#A83236" />
    </svg>
  );
}
