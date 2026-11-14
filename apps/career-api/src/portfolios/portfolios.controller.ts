import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Provider } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { PortfolioService, type Principal } from '@flacroncv/career-server';
import type { CreatePortfolioInput, PublishPortfolioInput, UpdatePortfolioInput } from '@flacroncv/career-shared';
import { Public } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

class CreatePortfolioDto implements CreatePortfolioInput {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';
}

class SectionsDto {
  @IsOptional()
  @IsBoolean()
  summary?: boolean;

  @IsOptional()
  @IsBoolean()
  evidence?: boolean;

  @IsOptional()
  @IsBoolean()
  skills?: boolean;

  @IsOptional()
  @IsBoolean()
  contact?: boolean;
}

class UpdatePortfolioDto implements UpdatePortfolioInput {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceIds?: string[];

  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  showPhone?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SectionsDto)
  sections?: SectionsDto;

  /** Evidence id -> case-study text; checked in the service. */
  @IsOptional()
  @IsObject()
  caseStudies?: Record<string, string>;
}

class PublishPortfolioDto implements PublishPortfolioInput {
  @IsIn(['public', 'private'])
  visibility!: 'public' | 'private';
}

class QrQuery {
  @IsString()
  @MaxLength(200)
  origin!: string;
}

class PublicQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;
}

@Controller()
export class PortfoliosController {
  constructor(@Inject(PortfolioService) private readonly portfolios: PortfolioService) {}

  @Get('portfolios')
  list(@CurrentPrincipal() principal: Principal) {
    return this.portfolios.list(principal);
  }

  @Post('portfolios')
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreatePortfolioDto) {
    return this.portfolios.create(principal, body);
  }

  @Public()
  @Get('portfolios/public/:slug')
  readPublic(@Param('slug') slug: string, @Query() query: PublicQuery) {
    return this.portfolios.readPublic(slug, query.token);
  }

  @Get('portfolios/:portfolioId')
  get(@CurrentPrincipal() principal: Principal, @Param('portfolioId') portfolioId: string) {
    return this.portfolios.get(principal, portfolioId);
  }

  @Patch('portfolios/:portfolioId')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('portfolioId') portfolioId: string,
    @Body() body: UpdatePortfolioDto,
  ) {
    return this.portfolios.update(principal, portfolioId, body);
  }

  @Post('portfolios/:portfolioId/publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('portfolioId') portfolioId: string,
    @Body() body: PublishPortfolioDto,
  ) {
    return this.portfolios.publish(principal, portfolioId, body.visibility);
  }

  @Post('portfolios/:portfolioId/unpublish')
  unpublish(@CurrentPrincipal() principal: Principal, @Param('portfolioId') portfolioId: string) {
    return this.portfolios.unpublish(principal, portfolioId);
  }

  @Delete('portfolios/:portfolioId')
  remove(@CurrentPrincipal() principal: Principal, @Param('portfolioId') portfolioId: string) {
    return this.portfolios.remove(principal, portfolioId);
  }

  @Post('portfolios/:portfolioId/revoke')
  revoke(@CurrentPrincipal() principal: Principal, @Param('portfolioId') portfolioId: string) {
    return this.portfolios.revoke(principal, portfolioId);
  }

  @Get('portfolios/:portfolioId/qr')
  qr(
    @CurrentPrincipal() principal: Principal,
    @Param('portfolioId') portfolioId: string,
    @Query() query: QrQuery,
  ) {
    return this.portfolios.qr(principal, portfolioId, query.origin);
  }
}

export const portfolioProviders: Provider[] = [
  {
    provide: PortfolioService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new PortfolioService(database.connectionPool),
  },
];
