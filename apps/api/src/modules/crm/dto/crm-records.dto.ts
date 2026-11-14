import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CRMCustomerSource,
  CRMCustomerStatus,
  CRMLeadStage,
  CRMTransactionStatus,
  type AddCRMNoteDto as AddCRMNote,
  type CreateCRMCustomerDto as CreateCRMCustomer,
  type CreateCRMLeadDto as CreateCRMLead,
  type CreateCRMTransactionDto as CreateCRMTransaction,
  type UpdateCRMCustomerDto as UpdateCRMCustomer,
  type UpdateCRMLeadDto as UpdateCRMLead,
} from '@flacroncv/shared-types';

/*
 * Validated request bodies for the CRM record endpoints.
 *
 * The shared-types DTOs are TypeScript interfaces, which the global
 * ValidationPipe cannot see at runtime, so these endpoints accepted anything:
 * `{}` crashed with a 500 and `{ stage: 'zzz', email: 'not-an-email' }` was
 * stored and then matched no stage filter. Each class implements its shared
 * interface, so the web client and the API keep one contract.
 */

const NAME_MAX = 120;
const SHORT_MAX = 200;
const TEXT_MAX = 5000;

export class CreateCRMCustomerBody implements CreateCRMCustomer {
  @IsString() @IsNotEmpty() @MaxLength(NAME_MAX) name!: string;
  @IsEmail() @MaxLength(SHORT_MAX) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) company?: string;
  @IsOptional() @IsEnum(CRMCustomerStatus) status?: CRMCustomerStatus;
  @IsOptional() @IsEnum(CRMCustomerSource) source?: CRMCustomerSource;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(50, { each: true }) tags?: string[];
}

export class UpdateCRMCustomerBody implements UpdateCRMCustomer {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) company?: string;
  @IsOptional() @IsEnum(CRMCustomerStatus) status?: CRMCustomerStatus;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(50, { each: true }) tags?: string[];
  @IsOptional() @IsEnum(CRMCustomerSource) source?: CRMCustomerSource;
}

export class CreateCRMLeadBody implements CreateCRMLead {
  @IsString() @IsNotEmpty() @MaxLength(NAME_MAX) name!: string;
  @IsEmail() @MaxLength(SHORT_MAX) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) company?: string;
  @IsOptional() @IsEnum(CRMCustomerSource) source?: CRMCustomerSource;
  @IsOptional() @IsEnum(CRMLeadStage) stage?: CRMLeadStage;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(NAME_MAX) assignedToName?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) notes?: string;
}

export class UpdateCRMLeadBody implements UpdateCRMLead {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) company?: string;
  @IsOptional() @IsEnum(CRMLeadStage) stage?: CRMLeadStage;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(NAME_MAX) assignedToName?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) notes?: string;
}

export class CreateCRMTransactionBody implements CreateCRMTransaction {
  @IsString() @IsNotEmpty() @MaxLength(SHORT_MAX) customerId!: string;
  @IsString() @IsNotEmpty() @MaxLength(NAME_MAX) customerName!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @MaxLength(60) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) description?: string;
  @IsOptional() @IsISO8601() date?: string;
  @IsOptional() @IsEnum(CRMTransactionStatus) status?: CRMTransactionStatus;
}

export class AddCRMNoteBody implements AddCRMNote {
  @IsString() @IsNotEmpty() @MaxLength(TEXT_MAX) content!: string;
}
