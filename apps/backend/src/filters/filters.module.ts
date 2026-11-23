import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FilterOptions {
  categories: string[];
  vendors: { code: string; name: string }[];
  items: { id: number; sourceItemId: number; name: string }[];
}

@Injectable()
export class FilterOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The values the filter bar offers. */
  async options(): Promise<FilterOptions> {
    const [items, vendors] = await Promise.all([
      this.prisma.item.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, sourceItemId: true, name: true, category: true, vendorCode: true },
      }),
      this.prisma.vendor.findMany(),
    ]);
    const names = new Map(vendors.map((v) => [v.code, v.name]));
    const codes = [...new Set(items.map((i) => i.vendorCode))].sort();
    return {
      categories: [...new Set(items.map((i) => i.category))].sort(),
      vendors: codes.map((code) => ({ code, name: names.get(code) ?? code })),
      items: items.map(({ id, sourceItemId, name }) => ({ id, sourceItemId, name })),
    };
  }
}

@Controller('filters')
export class FilterOptionsController {
  constructor(private readonly service: FilterOptionsService) {}

  /** Options for the filter bar. Requires login (global guard). */
  @Get('options')
  options(): Promise<FilterOptions> {
    return this.service.options();
  }
}

@Module({ controllers: [FilterOptionsController], providers: [FilterOptionsService] })
export class FiltersModule {}
