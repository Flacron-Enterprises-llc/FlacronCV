import 'reflect-metadata';
import { ArgumentMetadata, Type, ValidationPipe } from '@nestjs/common';

/**
 * Same options as `apps/api/src/main.ts`. Tests that only call
 * `class-validator`'s `validate()` miss `forbidNonWhitelisted` — that flag
 * lives on the pipe, not on the decorator.
 */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

export async function transformBody<T extends object>(cls: Type<T>, payload: unknown): Promise<T> {
  const pipe = createAppValidationPipe();
  const metadata: ArgumentMetadata = { type: 'body', metatype: cls, data: '' };
  return pipe.transform(payload, metadata) as Promise<T>;
}
