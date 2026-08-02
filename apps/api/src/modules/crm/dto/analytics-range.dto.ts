import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Optional reporting window for the CRM analytics endpoints.
 *
 * Both bounds are inclusive calendar dates (`YYYY-MM-DD`). Omitting both means
 * "all time", which is the default the dashboard opens with.
 *
 * Validated as a strict date-only pattern rather than a loose string so a
 * malformed value fails fast with a 400 instead of silently producing an
 * `Invalid Date` that would filter everything out and render an empty
 * dashboard as though the business had no customers.
 */
export class AnalyticsRangeDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a YYYY-MM-DD date' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be a YYYY-MM-DD date' })
  to?: string;
}
