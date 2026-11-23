import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth-user';
import type { RecommendationType } from './recommendation-logic';
import { RecommendationsService, type RecommendationView } from './recommendations.service';

const TYPES: RecommendationType[] = ['REPLENISH', 'HOLD_PURCHASES'];
const STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISCARDED'];

export class CreateRecommendationDto {
  @IsInt()
  itemId!: number;

  @IsIn(TYPES)
  type!: RecommendationType;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  justification?: string;
}

export class EditRecommendationDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  justification?: string;
}

export class DiscardDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** The Director and the Procurement Team may create, edit and Discard Recommendations; every logged-in User may read. */
@Controller()
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  /** `?status=DRAFT,APPROVED`, `?type=REPLENISH`, `?itemId=3` filter the list. */
  @Get('recommendations')
  list(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('itemId') itemId?: string,
  ): Promise<RecommendationView[]> {
    const statuses = status?.split(',').filter((s) => STATUSES.includes(s));
    const parsedItem = itemId !== undefined && /^\d+$/.test(itemId) ? Number(itemId) : undefined;
    return this.recommendations.list({
      itemId: parsedItem,
      status: statuses?.length ? statuses : undefined,
      type: TYPES.includes(type as RecommendationType) ? (type as RecommendationType) : undefined,
    });
  }

  /** For the Item detail page. */
  @Get('items/:id/recommendations')
  forItem(@Param('id', ParseIntPipe) id: number): Promise<RecommendationView[]> {
    return this.recommendations.list({ itemId: id });
  }

  @Get('recommendations/:id')
  get(@Param('id', ParseIntPipe) id: number): Promise<RecommendationView> {
    return this.recommendations.get(id);
  }

  @Roles('DIRECTOR', 'PROCUREMENT_TEAM')
  @Post('recommendations')
  @HttpCode(201)
  create(@Body() body: CreateRecommendationDto, @CurrentUser() user: AuthUser): Promise<RecommendationView> {
    return this.recommendations.create(user.id, body);
  }

  @Roles('DIRECTOR', 'PROCUREMENT_TEAM')
  @Patch('recommendations/:id')
  edit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EditRecommendationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RecommendationView> {
    return this.recommendations.edit(id, user.id, body);
  }

  @Roles('DIRECTOR', 'PROCUREMENT_TEAM')
  @Post('recommendations/:id/update-to-current')
  @HttpCode(200)
  updateToCurrent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser): Promise<RecommendationView> {
    return this.recommendations.updateToCurrent(id, user.id);
  }

  @Roles('DIRECTOR', 'PROCUREMENT_TEAM')
  @Post('recommendations/:id/discard')
  @HttpCode(200)
  discard(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: DiscardDto | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<RecommendationView> {
    return this.recommendations.discard(id, user.id, body?.reason);
  }
}
