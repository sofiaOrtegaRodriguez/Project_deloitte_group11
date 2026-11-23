import type { UrgencyLevel } from '@/lib/dashboard';

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  CRITICAL: 'Critical',
  ATTENTION: 'Attention',
  NORMAL: 'Normal',
};

/** Red, amber and green are used only for Urgency Levels. */
export const URGENCY_DOT: Record<UrgencyLevel, string> = {
  CRITICAL: 'bg-critical',
  ATTENTION: 'bg-attention',
  NORMAL: 'bg-normal',
};

const LEVELS: UrgencyLevel[] = ['CRITICAL', 'ATTENTION', 'NORMAL'];

export function UrgencyCounts({ counts }: { counts: Record<UrgencyLevel, number> }) {
  return (
    <section aria-label="Items per Urgency Level" className="grid grid-cols-3 gap-3">
      {LEVELS.map((level) => (
        <div key={level} data-testid={`urgency-${level}`} className="flex items-center gap-2 rounded-lg border bg-background p-3">
          <span className={`size-2.5 rounded-full ${URGENCY_DOT[level]}`} aria-hidden />
          <span className="text-xl font-semibold tabular-nums">{counts[level]}</span>
          <span className="text-xs text-muted-foreground">{URGENCY_LABEL[level]}</span>
        </div>
      ))}
    </section>
  );
}
