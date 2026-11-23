// The Simulation (spec "Simulation", ADR 0004): the Reference Date moves forward one day every N real seconds,
// with a full recalculation on each step, so Alerts and indicators change live.
//
// - State lives in the `simulation_state` table (one row): global, seen by every User, survives restarts.
// - Time comes from the injectable Clock. `tick()` is the stepper: it advances one day only when
//   secondsPerDay of clock time have passed since the last step. A real-time interval calls `tick()` once
//   a second (not under tests, where NODE_ENV is "test"); tests call it directly after `FakeClock.advance`.
// - End of data: when a step would pass the dataset's last date, the Simulation becomes FINISHED and stays
//   on that last date. The previous Reference Date is restored only by an explicit stop.
// - While the Simulation is not STOPPED, manual Reference Date changes in Settings are rejected (409).
// - Reminders run on real time and do not depend on this module.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Post,
} from '@nestjs/common';
import { IsInt, IsString, Matches, Min } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { CLOCK, type Clock } from '../clock/clock';
import type { Prisma, SimulationState, SimulationStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runRecalculation } from '../recalculation/run-recalculation';

const DAY_MS = 24 * 60 * 60 * 1000;
const toIso = (date: Date): string => date.toISOString().slice(0, 10);
const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null): string | null => (date ? toIso(date) : null);

export class StartSimulationDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be a date like 2026-02-12' })
  startDate!: string;

  @IsInt({ message: 'secondsPerDay must be a whole number' })
  @Min(1, { message: 'secondsPerDay must be at least 1' })
  secondsPerDay!: number;
}

export interface SimulationView {
  status: SimulationStatus;
  /** True only while days are advancing (not paused, stopped or finished). */
  running: boolean;
  startDate: string | null;
  /** The simulated date (the Reference Date in force); null when stopped. */
  currentDate: string | null;
  secondsPerDay: number | null;
  /** The last date of the data: where the Simulation finishes. */
  datasetEnd: string | null;
}

@Injectable()
export class SimulationService {
  /** Serialises start/pause/resume/stop/tick so a slow recalculation never overlaps another step. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  status(): Promise<SimulationView> {
    return this.view();
  }

  start(dto: StartSimulationDto, user: AuthUser): Promise<SimulationView> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (state && state.status !== 'STOPPED') throw new ConflictException('A Simulation is already in progress');
      if (toDate(dto.startDate).toISOString().slice(0, 10) !== dto.startDate) {
        throw new BadRequestException(`Invalid date: ${dto.startDate}`);
      }
      const range = await this.datasetRange();
      if (!range) throw new BadRequestException('There is no data yet, so a Simulation cannot start');
      if (dto.startDate < range.start || dto.startDate > range.end) {
        throw new BadRequestException(`startDate must be between ${range.start} and ${range.end}`);
      }
      const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
      const data = {
        status: 'RUNNING' as const,
        startDate: toDate(dto.startDate),
        currentDate: toDate(dto.startDate),
        secondsPerDay: dto.secondsPerDay,
        previousReferenceDate: settings?.referenceDate ?? null,
        lastStepAt: this.clock.now(),
      };
      await this.prisma.$transaction([
        this.prisma.simulationState.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }),
        this.prisma.settings.upsert({
          where: { id: 1 },
          create: { id: 1, referenceDate: data.currentDate },
          update: { referenceDate: data.currentDate },
        }),
        this.logQuery(user, `started from ${dto.startDate}, ${dto.secondsPerDay} s per day`),
      ]);
      await runRecalculation(this.prisma);
      return this.view();
    });
  }

  pause(): Promise<SimulationView> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (state?.status !== 'RUNNING') throw new ConflictException('The Simulation is not running');
      await this.prisma.simulationState.update({ where: { id: 1 }, data: { status: 'PAUSED' } });
      return this.view();
    });
  }

  resume(): Promise<SimulationView> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (state?.status !== 'PAUSED') throw new ConflictException('The Simulation is not paused');
      // The current day gets its full duration again.
      await this.prisma.simulationState.update({
        where: { id: 1 },
        data: { status: 'RUNNING', lastStepAt: this.clock.now() },
      });
      return this.view();
    });
  }

  /** Stops (also from FINISHED), restores the previous Reference Date and recalculates. */
  stop(user: AuthUser): Promise<SimulationView> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (!state || state.status === 'STOPPED') throw new ConflictException('There is no Simulation to stop');
      await this.prisma.$transaction([
        this.prisma.simulationState.update({
          where: { id: 1 },
          data: { status: 'STOPPED', currentDate: null, lastStepAt: null },
        }),
        this.prisma.settings.upsert({
          where: { id: 1 },
          create: { id: 1, referenceDate: state.previousReferenceDate },
          update: { referenceDate: state.previousReferenceDate },
        }),
        this.logQuery(user, `stopped; Reference Date restored to ${iso(state.previousReferenceDate) ?? 'the last date in the data'}`),
      ]);
      await runRecalculation(this.prisma);
      return this.view();
    });
  }

  /**
   * Advances one day if the Simulation is running and secondsPerDay of clock time have passed since the last
   * step. Returns true when it stepped. At the end of the data it becomes FINISHED instead.
   */
  tick(): Promise<boolean> {
    return this.exclusive(async () => {
      const state = await this.load();
      if (state?.status !== 'RUNNING' || !state.currentDate || !state.lastStepAt) return false;
      const now = this.clock.now();
      if (now.getTime() - state.lastStepAt.getTime() < state.secondsPerDay * 1000) return false;

      const range = await this.datasetRange();
      const next = new Date(state.currentDate.getTime() + DAY_MS);
      if (!range || toIso(next) > range.end) {
        await this.prisma.simulationState.update({ where: { id: 1 }, data: { status: 'FINISHED', lastStepAt: now } });
        return false;
      }
      await this.prisma.$transaction([
        this.prisma.simulationState.update({ where: { id: 1 }, data: { currentDate: next, lastStepAt: now } }),
        this.prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, referenceDate: next }, update: { referenceDate: next } }),
      ]);
      await runRecalculation(this.prisma);
      return true;
    });
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private load(): Promise<SimulationState | null> {
    return this.prisma.simulationState.findUnique({ where: { id: 1 } });
  }

  private async view(): Promise<SimulationView> {
    const state = await this.load();
    const range = await this.datasetRange();
    const status = state?.status ?? 'STOPPED';
    return {
      status,
      running: status === 'RUNNING',
      startDate: status === 'STOPPED' ? null : iso(state?.startDate ?? null),
      currentDate: status === 'STOPPED' ? null : iso(state?.currentDate ?? null),
      secondsPerDay: status === 'STOPPED' ? null : (state?.secondsPerDay ?? null),
      datasetEnd: range?.end ?? null,
    };
  }

  private logQuery(user: AuthUser, text: string) {
    const changes = [{ field: 'simulation', old: null, new: text }];
    return this.prisma.configurationLog.create({
      data: { userId: user.id, userName: user.name, changes: changes as unknown as Prisma.InputJsonValue },
    });
  }

  private async datasetRange(): Promise<{ start: string; end: string } | null> {
    const r = await this.prisma.snapshot.aggregate({ _min: { date: true }, _max: { date: true } });
    return r._min.date && r._max.date ? { start: toIso(r._min.date), end: toIso(r._max.date) } : null;
  }
}

/** Calls `tick()` once a second in real time. Disabled under tests, which call `tick()` themselves. */
@Injectable()
export class SimulationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly simulation: SimulationService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.simulation.tick().catch((error) => console.error('Simulation step failed', error));
    }, 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  /** Any logged-in User: feeds the banner and the live monitor. */
  @Get()
  status(): Promise<SimulationView> {
    return this.simulation.status();
  }

  @Roles('DIRECTOR')
  @Post('start')
  @HttpCode(200)
  start(@Body() body: StartSimulationDto, @CurrentUser() user: AuthUser): Promise<SimulationView> {
    return this.simulation.start(body, user);
  }

  @Roles('DIRECTOR')
  @Post('pause')
  @HttpCode(200)
  pause(): Promise<SimulationView> {
    return this.simulation.pause();
  }

  @Roles('DIRECTOR')
  @Post('resume')
  @HttpCode(200)
  resume(): Promise<SimulationView> {
    return this.simulation.resume();
  }

  @Roles('DIRECTOR')
  @Post('stop')
  @HttpCode(200)
  stop(@CurrentUser() user: AuthUser): Promise<SimulationView> {
    return this.simulation.stop(user);
  }
}

@Module({ controllers: [SimulationController], providers: [SimulationService, SimulationScheduler] })
export class SimulationModule {}
