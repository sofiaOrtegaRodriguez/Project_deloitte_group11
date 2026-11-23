import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import type { Prisma } from '../generated/prisma/client';
import { loadSettings } from '../indicators/load-indicators';
import { PrismaService } from '../prisma/prisma.service';
import { runRecalculation } from '../recalculation/run-recalculation';

const toIso = (date: Date): string => date.toISOString().slice(0, 10);
const num = { allowNaN: false, allowInfinity: false };

export class UpdateSettingsDto {
  @IsOptional() @IsNumber(num) abcThresholdA?: number;
  @IsOptional() @IsNumber(num) abcThresholdB?: number;
  @IsOptional() @IsNumber(num) @Min(0, { message: 'urgencyFactor must not be negative' }) urgencyFactor?: number;
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'criticalAbcClasses needs at least one class' })
  @IsIn(['A', 'B', 'C'], { each: true })
  criticalAbcClasses?: string[];
  @IsOptional() @IsNumber(num) @Min(0, { message: 'lowTurnoverThreshold must not be negative' }) lowTurnoverThreshold?: number;
  /** A date like 2026-02-12, or null to follow the dataset's last date. */
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'referenceDate must be a date like 2026-02-12, or null' })
  referenceDate?: string | null;
}

export class UpdateOverrideDto {
  /** A number, or null to clear this side. Omit to leave it unchanged. */
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber(num)
  @Min(0, { message: 'minRequired must not be negative' })
  minRequired?: number | null;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber(num)
  @Min(0, { message: 'maxCapacity must not be negative' })
  maxCapacity?: number | null;
}

export interface SettingsView {
  referenceDate: string | null;
  /** The Reference Date in force (the setting, or the dataset's last date). */
  effectiveReferenceDate: string | null;
  datasetRange: { start: string; end: string } | null;
  abcThresholdA: number;
  abcThresholdB: number;
  urgencyFactor: number;
  criticalAbcClasses: string[];
  lowTurnoverThreshold: number;
}

export interface OverrideView {
  itemId: number;
  sourceItemId: number;
  name: string;
  minRequired: number | null;
  maxCapacity: number | null;
}

interface Change {
  field: string;
  old: unknown;
  new: unknown;
}

export interface LogEntryView {
  id: number;
  createdAt: string;
  userId: number | null;
  userName: string;
  changes: Change[];
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SettingsView> {
    const settings = await loadSettings(this.prisma);
    const range = await this.datasetRange();
    return {
      referenceDate: settings.referenceDate,
      effectiveReferenceDate: settings.referenceDate ?? range?.end ?? null,
      datasetRange: range,
      abcThresholdA: settings.config.abcThresholdA,
      abcThresholdB: settings.config.abcThresholdB,
      urgencyFactor: settings.config.urgencyFactor,
      criticalAbcClasses: [...settings.config.criticalAbcClasses],
      lowTurnoverThreshold: settings.config.lowTurnoverThreshold,
    };
  }

  async update(dto: UpdateSettingsDto, user: AuthUser): Promise<SettingsView> {
    const current = await this.get();
    const next = {
      abcThresholdA: dto.abcThresholdA ?? current.abcThresholdA,
      abcThresholdB: dto.abcThresholdB ?? current.abcThresholdB,
      urgencyFactor: dto.urgencyFactor ?? current.urgencyFactor,
      criticalAbcClasses: dto.criticalAbcClasses
        ? (['A', 'B', 'C'] as const).filter((c) => dto.criticalAbcClasses!.includes(c))
        : current.criticalAbcClasses,
      lowTurnoverThreshold: dto.lowTurnoverThreshold ?? current.lowTurnoverThreshold,
      referenceDate: dto.referenceDate === undefined ? current.referenceDate : dto.referenceDate,
    };

    if (!(next.abcThresholdA > 0 && next.abcThresholdA < next.abcThresholdB && next.abcThresholdB <= 100)) {
      throw new BadRequestException('ABC thresholds must satisfy 0 < A < B <= 100');
    }
    if (next.referenceDate !== null) {
      if (new Date(`${next.referenceDate}T00:00:00Z`).toISOString().slice(0, 10) !== next.referenceDate) {
        throw new BadRequestException(`Invalid date: ${next.referenceDate}`);
      }
      const range = current.datasetRange;
      if (!range) throw new BadRequestException('There is no data yet, so a Reference Date cannot be set');
      if (dto.referenceDate !== undefined && (next.referenceDate < range.start || next.referenceDate > range.end)) {
        throw new BadRequestException(`Reference Date must be between ${range.start} and ${range.end}`);
      }
    }

    const changes: Change[] = [];
    for (const field of [
      'referenceDate',
      'abcThresholdA',
      'abcThresholdB',
      'urgencyFactor',
      'criticalAbcClasses',
      'lowTurnoverThreshold',
    ] as const) {
      if (JSON.stringify(current[field]) !== JSON.stringify(next[field])) {
        changes.push({ field, old: current[field], new: next[field] });
      }
    }
    if (changes.length === 0) return current;

    const data = {
      ...next,
      criticalAbcClasses: [...next.criticalAbcClasses],
      referenceDate: next.referenceDate ? new Date(`${next.referenceDate}T00:00:00Z`) : null,
    };
    await this.prisma.$transaction([
      this.prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }),
      this.logQuery(user, changes),
    ]);
    await runRecalculation(this.prisma);
    return this.get();
  }

  async listOverrides(): Promise<OverrideView[]> {
    const rows = await this.prisma.thresholdOverride.findMany({ include: { item: true }, orderBy: { itemId: 'asc' } });
    return rows.map((r) => ({
      itemId: r.itemId,
      sourceItemId: r.item.sourceItemId,
      name: r.item.name,
      minRequired: r.minRequired?.toNumber() ?? null,
      maxCapacity: r.maxCapacity?.toNumber() ?? null,
    }));
  }

  async setOverride(itemId: number, dto: UpdateOverrideDto, user: AuthUser): Promise<OverrideView | null> {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    const existing = await this.prisma.thresholdOverride.findUnique({ where: { itemId } });
    const old = { minRequired: existing?.minRequired?.toNumber() ?? null, maxCapacity: existing?.maxCapacity?.toNumber() ?? null };
    const next = {
      minRequired: dto.minRequired === undefined ? old.minRequired : dto.minRequired,
      maxCapacity: dto.maxCapacity === undefined ? old.maxCapacity : dto.maxCapacity,
    };
    await this.saveOverride(item, old, next, user);
    return (await this.listOverrides()).find((o) => o.itemId === itemId) ?? null;
  }

  async clearOverride(itemId: number, user: AuthUser): Promise<void> {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    const existing = await this.prisma.thresholdOverride.findUnique({ where: { itemId } });
    const old = { minRequired: existing?.minRequired?.toNumber() ?? null, maxCapacity: existing?.maxCapacity?.toNumber() ?? null };
    await this.saveOverride(item, old, { minRequired: null, maxCapacity: null }, user);
  }

  async log(): Promise<LogEntryView[]> {
    const rows = await this.prisma.configurationLog.findMany({ orderBy: { id: 'desc' } });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userId: r.userId,
      userName: r.userName,
      changes: r.changes as unknown as Change[],
    }));
  }

  private async saveOverride(
    item: { id: number; name: string },
    old: { minRequired: number | null; maxCapacity: number | null },
    next: { minRequired: number | null; maxCapacity: number | null },
    user: AuthUser,
  ): Promise<void> {
    const changes: Change[] = [];
    for (const side of ['minRequired', 'maxCapacity'] as const) {
      if (old[side] !== next[side]) {
        changes.push({ field: `override ${side} of Item ${item.id} (${item.name})`, old: old[side], new: next[side] });
      }
    }
    if (changes.length === 0) return;
    const write =
      next.minRequired === null && next.maxCapacity === null
        ? this.prisma.thresholdOverride.deleteMany({ where: { itemId: item.id } })
        : this.prisma.thresholdOverride.upsert({
            where: { itemId: item.id },
            create: { itemId: item.id, ...next },
            update: next,
          });
    await this.prisma.$transaction([write, this.logQuery(user, changes)]);
    await runRecalculation(this.prisma);
  }

  private logQuery(user: AuthUser, changes: Change[]) {
    return this.prisma.configurationLog.create({
      data: { userId: user.id, userName: user.name, changes: changes as unknown as Prisma.InputJsonValue },
    });
  }

  private async datasetRange(): Promise<{ start: string; end: string } | null> {
    const r = await this.prisma.snapshot.aggregate({ _min: { date: true }, _max: { date: true } });
    return r._min.date && r._max.date ? { start: toIso(r._min.date), end: toIso(r._max.date) } : null;
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Readable by every logged-in User (read-only for the Procurement Team). */
  @Get()
  get(): Promise<SettingsView> {
    return this.settings.get();
  }

  @Roles('DIRECTOR')
  @Patch()
  update(@Body() body: UpdateSettingsDto, @CurrentUser() user: AuthUser): Promise<SettingsView> {
    return this.settings.update(body, user);
  }

  @Get('overrides')
  overrides(): Promise<OverrideView[]> {
    return this.settings.listOverrides();
  }

  @Roles('DIRECTOR')
  @Put('overrides/:itemId')
  set(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpdateOverrideDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OverrideView | null> {
    return this.settings.setOverride(itemId, body, user);
  }

  @Roles('DIRECTOR')
  @Delete('overrides/:itemId')
  @HttpCode(204)
  clear(@Param('itemId', ParseIntPipe) itemId: number, @CurrentUser() user: AuthUser): Promise<void> {
    return this.settings.clearOverride(itemId, user);
  }

  @Roles('DIRECTOR')
  @Get('log')
  log(): Promise<LogEntryView[]> {
    return this.settings.log();
  }
}

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
