// The shared Global Filters (ticket 06), used by every analytics endpoint. Later tickets (07, 08, 20, 22, 23)
// extend `FilterQuery` instead of defining their own period/Item parameters.
//
// Design decisions
//  - Within one filter the values are OR-ed (category=A&category=B); different filters are AND-ed.
//  - Multi-value parameters are repeated query parameters (`category=A&category=B`), not comma lists,
//    because Category names may contain commas.
//  - Classifications (ABC Class, Urgency Level, Stock Status) are computed on the WHOLE portfolio first and the
//    filter is applied afterwards, so an Item keeps its ABC Class whatever the filter. Portfolio indicators
//    (KPIs, counts, availability) are then aggregated over the slice only.
//  - The slice is decided on the current period. The comparison period covers the same Items (so the two
//    sides compare like with like), with each Item's classification of that earlier period.
//  - Items with no Snapshot yet have no classification: attribute filters (Item, Category, Vendor) keep them,
//    classification filters drop them. Items with a Snapshot only before a short period appear with their
//    carried-forward Item State.
import { BadRequestException } from '@nestjs/common';
import { Allow, IsOptional, Matches } from 'class-validator';
import { dayNumber } from '../indicators/indicators';
import type { IndicatorInputs } from '../indicators/load-indicators';
import type { AbcClass, ItemIndicators, Period, StockStatus, UrgencyLevel } from '../indicators/types';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ABC_CLASSES: readonly AbcClass[] = ['A', 'B', 'C'];
export const URGENCY_LEVELS: readonly UrgencyLevel[] = ['CRITICAL', 'ATTENTION', 'NORMAL'];
export const STOCK_STATUSES: readonly StockStatus[] = ['BELOW_MINIMUM', 'REORDER_NEEDED', 'EXCESS', 'NORMAL'];

/** Query-string parameters shared by the analytics endpoints. Multi-value ones may be repeated. */
export class FilterQuery {
  /** First day of the period. Default: the first date in the dataset. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'from must be a date like 2026-02-12' })
  from?: string;

  /** Last day of the period (the Item State is read from it). Default: the Reference Date. */
  @IsOptional()
  @Matches(ISO_DAY, { message: 'to must be a date like 2026-02-12' })
  to?: string;

  /** Item ids (the `id` of /api/items). Checked by `parseFilters`. */
  @Allow()
  itemId?: string | string[];

  @Allow()
  category?: string | string[];

  /** Vendor codes, e.g. V001. */
  @Allow()
  vendor?: string | string[];

  @Allow()
  abcClass?: string | string[];

  @Allow()
  urgencyLevel?: string | string[];

  @Allow()
  stockStatus?: string | string[];
}

export interface ItemFilters {
  itemIds: number[];
  categories: string[];
  vendors: string[];
  abcClasses: AbcClass[];
  urgencyLevels: UrgencyLevel[];
  stockStatuses: StockStatus[];
}

export interface ParsedFilters {
  from?: string;
  to?: string;
  filters: ItemFilters;
}

function list(name: string, value: unknown): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    if (typeof v !== 'string' || v.trim() === '') throw new BadRequestException(`${name} must be a non-empty value`);
  }
  return values as string[];
}

function oneOf<T extends string>(name: string, value: unknown, allowed: readonly T[]): T[] {
  return list(name, value).map((v) => {
    if (!allowed.includes(v as T)) throw new BadRequestException(`${name} must be one of ${allowed.join(', ')}`);
    return v as T;
  });
}

/** Validates the query (400 on bad input) and normalises the multi-value filters to arrays. */
export function parseFilters(query: FilterQuery): ParsedFilters {
  const { from, to } = query;
  for (const date of [from, to]) {
    // Date.parse rolls impossible days over (2025-02-30 becomes 2 March), so check the round trip.
    if (date && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
      throw new BadRequestException(`Invalid date: ${date}`);
    }
  }
  if (from && to && dayNumber(from) > dayNumber(to)) throw new BadRequestException('from must not be after to');
  return {
    from,
    to,
    filters: {
      itemIds: list('itemId', query.itemId).map((v) => {
        if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))) throw new BadRequestException('itemId must be a whole number');
        return Number(v);
      }),
      categories: list('category', query.category),
      vendors: list('vendor', query.vendor),
      abcClasses: oneOf('abcClass', query.abcClass, ABC_CLASSES),
      urgencyLevels: oneOf('urgencyLevel', query.urgencyLevel, URGENCY_LEVELS),
      stockStatuses: oneOf('stockStatus', query.stockStatus, STOCK_STATUSES),
    },
  };
}

/** The period to analyse, or null when the dataset is empty. 400 when it starts after it ends. */
export function resolvePeriod(inputs: IndicatorInputs, from?: string, to?: string): Period | null {
  const end = to ?? inputs.referenceDate;
  if (!end || !inputs.datasetRange) return null;
  const start = from ?? (inputs.datasetRange.start < end ? inputs.datasetRange.start : end);
  if (dayNumber(start) > dayNumber(end)) throw new BadRequestException(`Invalid period: ${start} is after ${end}`);
  return { start, end };
}

export interface ItemAttributes {
  id: number;
  category: string;
  vendorCode: string;
}

/**
 * The one place that selects which Items a view covers. Returns the predicate `computeIndicators` applies after
 * it has classified the whole portfolio. The attributes of every Item are looked up by id.
 */
export function selectSlice(
  filters: ItemFilters,
  attributes: ReadonlyMap<number, ItemAttributes>,
): (indicators: ItemIndicators) => boolean {
  const has = <T>(values: T[], value: T | null) => values.length === 0 || (value !== null && values.includes(value));
  return (r) => {
    const item = attributes.get(r.itemId);
    if (!item) return false;
    return (
      has(filters.itemIds, item.id) &&
      has(filters.categories, item.category) &&
      has(filters.vendors, item.vendorCode) &&
      has(filters.abcClasses, r.abcClass) &&
      has(filters.urgencyLevels, r.urgencyLevel) &&
      has(filters.stockStatuses, r.stockStatus)
    );
  };
}
