// The injectable clock (spec "Seam C"). Anything that depends on real time (the Simulation stepper,
// Reminders) asks this clock instead of calling `new Date()`, so tests can control time.
//
//   constructor(@Inject(CLOCK) private readonly clock: Clock) {}
//   this.clock.now();
//
// ClockModule is global: no import needed. E2E tests swap it with
//   Test.createTestingModule(...).overrideProvider(CLOCK).useValue(new FakeClock(start))
// and move time with `fake.advance(ms)` (or `fake.set(date)`).
import { Global, Module } from '@nestjs/common';

export interface Clock {
  /** The current instant. */
  now(): Date;
}

/** DI token for the Clock. */
export const CLOCK = Symbol('Clock');

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** A clock that only moves when told to. For tests. */
export class FakeClock implements Clock {
  private current: number;

  constructor(start: Date | string | number = '2026-01-01T00:00:00Z') {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }

  set(date: Date | string | number): void {
    this.current = new Date(date).getTime();
  }
}

@Global()
@Module({ providers: [{ provide: CLOCK, useClass: SystemClock }], exports: [CLOCK] })
export class ClockModule {}
