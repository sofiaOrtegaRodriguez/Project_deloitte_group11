'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/lib/auth';
import { useConfiguration } from '@/lib/settings';
import { useSimulationAction, useSimulationStatus } from '@/lib/simulation';

const STATUS_LABEL = { STOPPED: 'Stopped', RUNNING: 'Running', PAUSED: 'Paused', FINISHED: 'Finished (end of data)' } as const;

/** Settings → Simulation. The Director controls it; the Procurement Team sees its status. */
export function SimulationSection() {
  const { data: user } = useCurrentUser();
  const { data: status, error } = useSimulationStatus();
  const { data: config } = useConfiguration();
  const action = useSimulationAction();
  const [startDate, setStartDate] = useState('');
  const [seconds, setSeconds] = useState('10');
  const isDirector = user?.role === 'DIRECTOR';
  const range = config?.datasetRange;

  function submit(event: FormEvent) {
    event.preventDefault();
    action.mutate({ action: 'start', body: { startDate, secondsPerDay: Number(seconds) } });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Simulation</h2>
      {!isDirector && <p className="text-sm text-muted-foreground">Only the Director can control the Simulation.</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {status && (
        <p className="text-sm">
          Status: <strong>{STATUS_LABEL[status.status]}</strong>
          {status.currentDate && (
            <>
              {' '}
              — simulated date {status.currentDate}, one day every {status.secondsPerDay} s (data ends {status.datasetEnd})
            </>
          )}
        </p>
      )}
      {isDirector && status?.status === 'STOPPED' && (
        <form onSubmit={submit} className="grid max-w-xl gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="sim-start">Start date</Label>
              <Input
                id="sim-start"
                type="date"
                min={range?.start}
                max={range?.end}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sim-speed">Seconds per day</Label>
              <Input
                id="sim-speed"
                type="number"
                min={1}
                step={1}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={action.isPending}>
              Start Simulation
            </Button>
          </div>
        </form>
      )}
      {isDirector && status && status.status !== 'STOPPED' && (
        <div className="flex gap-2">
          {status.status === 'RUNNING' && (
            <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: 'pause' })}>
              Pause
            </Button>
          )}
          {status.status === 'PAUSED' && (
            <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: 'resume' })}>
              Resume
            </Button>
          )}
          <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: 'stop' })}>
            Stop and restore the Reference Date
          </Button>
        </div>
      )}
      {action.error && <p role="alert" className="text-sm text-destructive">{action.error.message}</p>}
    </section>
  );
}
