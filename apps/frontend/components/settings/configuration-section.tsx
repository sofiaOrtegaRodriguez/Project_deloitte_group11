'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/lib/auth';
import { useConfiguration, useUpdateConfiguration, type Configuration } from '@/lib/settings';

const CLASSES = ['A', 'B', 'C'] as const;

function ConfigurationForm({ config, editable }: { config: Configuration; editable: boolean }) {
  const update = useUpdateConfiguration();
  const [a, setA] = useState(String(config.abcThresholdA));
  const [b, setB] = useState(String(config.abcThresholdB));
  const [factor, setFactor] = useState(String(config.urgencyFactor));
  const [classes, setClasses] = useState<string[]>(config.criticalAbcClasses);
  const [turnover, setTurnover] = useState(String(config.lowTurnoverThreshold));
  const [referenceDate, setReferenceDate] = useState(config.referenceDate ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate({
      abcThresholdA: Number(a),
      abcThresholdB: Number(b),
      urgencyFactor: Number(factor),
      criticalAbcClasses: classes,
      lowTurnoverThreshold: Number(turnover),
      referenceDate: referenceDate === '' ? null : referenceDate,
    });
  }

  const range = config.datasetRange;
  return (
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <fieldset disabled={!editable} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="abc-a">ABC threshold A (%)</Label>
            <Input id="abc-a" type="number" step="any" value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="abc-b">ABC threshold B (%)</Label>
            <Input id="abc-b" type="number" step="any" value={b} onChange={(e) => setB(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="urgency-factor">Urgency factor</Label>
          <Input id="urgency-factor" type="number" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            An Item is Critical when its autonomy is at most this factor times its Replenishment Time.
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">ABC Classes that count towards Critical</span>
          <div className="flex gap-4">
            {CLASSES.map((c) => (
              <label key={c} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={classes.includes(c)}
                  onChange={(e) => setClasses(e.target.checked ? [...classes, c] : classes.filter((x) => x !== c))}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="low-turnover">Low-Turnover threshold (turns per year)</Label>
          <Input id="low-turnover" type="number" step="any" value={turnover} onChange={(e) => setTurnover(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reference-date">Reference Date</Label>
          <Input
            id="reference-date"
            type="date"
            min={range?.start}
            max={range?.end}
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use the last date of the data
            {range ? ` (${range.end}; data runs from ${range.start})` : ''}.
          </p>
        </div>
      </fieldset>
      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save configuration'}
          </Button>
          {update.isSuccess && <span className="text-sm text-muted-foreground">Saved. Indicators were recalculated.</span>}
        </div>
      )}
      {update.error && <p role="alert" className="text-sm text-destructive">{update.error.message}</p>}
    </form>
  );
}

/** Settings → Configuration. Editable for the Director, read-only for the Procurement Team. */
export function ConfigurationSection() {
  const { data: user } = useCurrentUser();
  const { data: config, isPending, error } = useConfiguration();
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Configuration</h2>
      {user?.role !== 'DIRECTOR' && (
        <p className="text-sm text-muted-foreground">Only the Director can change the configuration.</p>
      )}
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {/* key: the form restarts from the saved values after a save. */}
      {config && (
        <ConfigurationForm key={JSON.stringify(config)} config={config} editable={user?.role === 'DIRECTOR'} />
      )}
    </section>
  );
}
