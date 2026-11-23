import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { dayNumber } from '../indicators/indicators';
import { computeFromDatabase } from '../indicators/load-indicators';
import type { IndicatorConfig, ItemIndicators, PortfolioIndicators, Period } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ItemsQuery {
  /** First day of the period. Default: the first date in the dataset. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be a date like 2026-02-12' })
  from?: string;

  /** Last day of the period, which is the day the Item State is read from. Default: the Reference Date. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be a date like 2026-02-12' })
  to?: string;
}

export interface ItemRow extends Omit<ItemIndicators, 'itemId'> {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  vendorCode: string;
}

export interface ItemsResponse {
  referenceDate: string | null;
  period: Period | null;
  config: IndicatorConfig;
  portfolio: PortfolioIndicators | null;
  items: ItemRow[];
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ItemsQuery): Promise<ItemsResponse> {
    const from = query.from;
    const to = query.to;
    for (const date of [from, to]) {
      // Date.parse rolls impossible days over (2025-02-30 becomes 2 March), so check the round trip.
      if (date && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        throw new BadRequestException(`Invalid date: ${date}`);
      }
    }
    if (from && to && dayNumber(from) > dayNumber(to)) throw new BadRequestException('from must not be after to');

    let computed: Awaited<ReturnType<typeof computeFromDatabase>>;
    try {
      computed = await computeFromDatabase(this.prisma, { from, to });
    } catch (error) {
      // A period that starts after the Reference Date (the default end) is the caller's mistake.
      if (error instanceof Error && error.message.startsWith('Invalid period')) throw new BadRequestException(error.message);
      throw error;
    }
    const { referenceDate, config, result } = computed;
    if (!result) return { referenceDate, period: null, config, portfolio: null, items: [] };
    const items = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });
    const byId = new Map(result.items.map((r) => [r.itemId, r]));

    return {
      referenceDate,
      period: result.period,
      config,
      portfolio: result.portfolio,
      items: items.map((item) => {
        const { itemId: _itemId, ...indicators } = byId.get(item.id)!;
        return {
          id: item.id,
          sourceItemId: item.sourceItemId,
          name: item.name,
          category: item.category,
          vendorCode: item.vendorCode,
          ...indicators,
        };
      }),
    };
  }
}

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  /** Every Item with its indicators and classifications. Requires login (global guard). */
  @Get()
  list(@Query() query: ItemsQuery): Promise<ItemsResponse> {
    return this.items.list(query);
  }
}

@Module({ controllers: [ItemsController], providers: [ItemsService] })
export class ItemsModule {}
