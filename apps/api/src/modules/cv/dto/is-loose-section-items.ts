import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const ITEM_STRING_MAX = 20000;
const ITEM_ARRAY_MAX = 50;
const ITEMS_MAX = 200;

const STRING_FIELDS = new Set([
  'id',
  'company',
  'position',
  'location',
  'startDate',
  'endDate',
  'description',
  'institution',
  'degree',
  'field',
  'gpa',
  'name',
  'category',
  'url',
  'issuer',
  'date',
  'expiryDate',
  'credentialId',
  'proficiency',
  'title',
  'email',
  'phone',
  'relationship',
  'subtitle',
  'level',
]);

const NULLABLE_STRING_FIELDS = new Set(['endDate', 'expiryDate']);
const BOOLEAN_FIELDS = new Set(['isCurrent']);
const NUMBER_FIELDS = new Set(['order']);
const STRING_ARRAY_FIELDS = new Set(['highlights', 'technologies']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function knownFieldOk(key: string, value: unknown): boolean {
  if (STRING_ARRAY_FIELDS.has(key)) {
    if (!Array.isArray(value) || value.length > ITEM_ARRAY_MAX) return false;
    return value.every((v) => typeof v === 'string' && v.length <= ITEM_STRING_MAX);
  }
  if (BOOLEAN_FIELDS.has(key)) return typeof value === 'boolean';
  if (NUMBER_FIELDS.has(key)) return typeof value === 'number' && Number.isFinite(value);
  if (STRING_FIELDS.has(key)) {
    if (value === null) return NULLABLE_STRING_FIELDS.has(key);
    return typeof value === 'string' && value.length <= ITEM_STRING_MAX;
  }
  // Extra keys are allowed without type checks. Full CVSectionItem union
  // enforcement is deferred to a migration — a nested class with
  // forbidNonWhitelisted would 400 existing autosaves that still carry
  // legacy keys.
  return true;
}

/**
 * Type/length checks on known CVSectionItem fields. Extra keys allowed.
 * Do not replace with @ValidateNested + forbidNonWhitelisted on a nested class.
 */
export function IsLooseSectionItemArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLooseSectionItemArray',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (!Array.isArray(value)) return false;
          if (value.length > ITEMS_MAX) return false;
          for (const item of value) {
            if (!isPlainObject(item)) return false;
            for (const [key, fieldValue] of Object.entries(item)) {
              if (!knownFieldOk(key, fieldValue)) return false;
            }
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an array of objects with bounded known fields (extra keys allowed)`;
        },
      },
    });
  };
}
