import { ReactNode } from 'react';

function Panel({
  title,
  body,
  action,
  live,
  busy,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  live?: boolean;
  busy?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live={live ? 'polite' : undefined}
      aria-busy={busy || undefined}
      className="mx-auto min-w-0 max-w-xl rounded-lg border border-career-line bg-career-wash px-4 py-6 text-center"
    >
      {busy ? <span className="fc-spinner mx-auto mb-3" aria-hidden="true" /> : null}
      <p className="text-balance text-base font-semibold text-career-ink">{title}</p>
      {body ? <p className="mt-2 text-pretty text-sm text-career-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <Panel title={label} busy />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} />;
}

export function NoResultsState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} />;
}

export function StaleSourceState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} />;
}

export function ProviderUnavailableState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} live />;
}

export function FailedJobState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} live />;
}

export function PermissionDeniedState({ title, body }: { title: string; body?: string }) {
  return <Panel title={title} body={body} />;
}

export function QuotaExhaustedState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} />;
}

export function PlanUpgradeState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <Panel title={title} body={body} action={action} />;
}
