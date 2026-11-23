import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { FilterQuery, parseFilters, resolvePeriod, selectSlice } from '../filters/filters';
import { computeIndicators, previousPeriod } from '../indicators/indicators';
import { loadIndicatorInputs } from '../indicators/load-indicators';
import type { IndicatorConfig, ItemIndicators, PortfolioIndicators, Period } from '../indicators/types';
import { PrismaService } from '../prisma/prisma.service';

export interface ItemRow extends Omit<ItemIndicators, 'itemId'> {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  vendorCode: string;
  /** Vendor name from the vendors table; falls back to the code when the Vendor is unknown. */
  vendorName: string;
}

export interface ItemsResponse {
  referenceDate: string | null;
  period: Period | null;
  config: IndicatorConfig;
  /** Portfolio indicators of the filtered slice. */
  portfolio: PortfolioIndicators | null;
  /** The previous period of the same length, and the same Items' portfolio indicators over it. */
  previousPeriod: Period | null;
  previousPortfolio: PortfolioIndicators | null;
  items: ItemRow[];
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FilterQuery): Promise<ItemsResponse> {
    const { from, to, filters } = parseFilters(query);
    const inputs = await loadIndicatorInputs(this.prisma);
    const { referenceDate, settings } = inputs;
    const { config } = settings;
    const period = resolvePeriod(inputs, from, to);
    if (!period) return { referenceDate, period: null, config, portfolio: null, previousPeriod: null, previousPortfolio: null, items: [] };
    const items = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });
    const result = computeIndicators(inputs.items, period, config, selectSlice(filters, new Map(items.map((i) => [i.id, i]))));
    // The comparison covers the same Items as the current slice (see filters.ts).
    const sliceIds = new Set(result.items.map((r) => r.itemId));
    const prevPeriod = previousPeriod(period);
    const previous = computeIndicators(inputs.items, prevPeriod, config, (r) => sliceIds.has(r.itemId));
    const vendorNames = new Map((await this.prisma.vendor.findMany()).map((v) => [v.code, v.name]));
    const byId = new Map(result.items.map((r) => [r.itemId, r]));

    return {
      referenceDate,
      period: result.period,
      config,
      portfolio: result.portfolio,
      previousPeriod: prevPeriod,
      previousPortfolio: previous.portfolio,
      items: items.filter((item) => byId.has(item.id)).map((item) => {
        const { itemId: _itemId, ...indicators } = byId.get(item.id)!;
        return {
          id: item.id,
          sourceItemId: item.sourceItemId,
          name: item.name,
          category: item.category,
          vendorCode: item.vendorCode,
          vendorName: vendorNames.get(item.vendorCode) ?? item.vendorCode,
          ...indicators,
        };
      }),
    };
  }
}

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  /** Every Item of the filtered slice with its indicators and classifications. Requires login (global guard). */
  @Get()
  list(@Query() query: FilterQuery): Promise<ItemsResponse> {
    return this.items.list(query);
  }
}

@Module({ controllers: [ItemsController], providers: [ItemsService] })
export class ItemsModule {}
