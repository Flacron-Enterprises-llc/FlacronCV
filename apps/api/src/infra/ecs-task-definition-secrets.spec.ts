import { secretPayload, transformTaskDefinition, TaskDef } from './ecs-task-definition-secrets';

const ARN = 'arn:aws:secretsmanager:us-east-1:111111111111:secret:flacroncv/production/api-AbC123';
const EXEC = 'arn:aws:iam::111111111111:role/flacroncv-api-execution';
const TASK = 'arn:aws:iam::111111111111:role/flacroncv-api-task';

const fixture = (): TaskDef => ({
  family: 'flacroncv-api',
  taskDefinitionArn: 'arn:aws:ecs:us-east-1:111111111111:task-definition/flacroncv-api:89',
  revision: 89,
  status: 'ACTIVE',
  requiresAttributes: [],
  compatibilities: ['FARGATE'],
  registeredAt: 'x',
  registeredBy: 'x',
  executionRoleArn: 'arn:aws:iam::111111111111:role/service-role/ecsTaskExecutionRole',
  taskRoleArn: 'arn:aws:iam::111111111111:role/flacroncv-ses-service-role',
  containerDefinitions: [{
    name: 'flacroncv-api',
    image: 'repo/flacroncv-api:abc',
    environment: [
      { name: 'STRIPE_SECRET_KEY', value: 'fake-stripe-secret-value-123' },
      { name: 'STRIPE_WEBHOOK_SECRET', value: 'fake-webhook-secret-value-456' },
      { name: 'FIREBASE_PRIVATE_KEY', value: 'fake-private-key-material-789' },
      { name: 'FIREBASE_CLIENT_EMAIL', value: 'svc@example.iam' },
      { name: 'AWS_ACCESS_KEY_ID', value: 'FAKEACCESSKEYID0000' },
      { name: 'AWS_SECRET_ACCESS_KEY', value: 'fake-aws-secret-access-key-000' },
      { name: 'APPLE_KEY_ID', value: 'ABC123' },
      { name: 'STRIPE_PRO_MONTHLY_PRICE_ID', value: 'price_x' },
      { name: 'APP_ID', value: 'flacron-cv' },
    ],
    secrets: null,
  }],
});

describe('transformTaskDefinition', () => {
  it('moves credentials to secret references, drops the borrowed AWS keys, keeps the rest, strips read-only fields', () => {
    const { register, secretKeys, removed } = transformTaskDefinition({ taskDefinition: fixture(), secretArn: ARN, executionRoleArn: EXEC, taskRoleArn: TASK });
    expect(secretKeys).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_PRIVATE_KEY']);
    expect(removed).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
    const c = (register.containerDefinitions as any[])[0];
    expect(c.environment.map((e: any) => e.name)).toEqual(['FIREBASE_CLIENT_EMAIL', 'APPLE_KEY_ID', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'APP_ID']);
    expect(c.secrets).toEqual(secretKeys.map((n) => ({ name: n, valueFrom: `${ARN}:${n}::` })));
    expect(register.executionRoleArn).toBe(EXEC);
    expect(register.taskRoleArn).toBe(TASK);
    for (const k of ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy']) expect(register).not.toHaveProperty(k);
    const text = JSON.stringify(register);
    for (const v of ['fake-stripe-secret-value-123', 'fake-webhook-secret-value-456', 'fake-private-key-material-789', 'FAKEACCESSKEYID0000', 'fake-aws-secret-access-key-000']) expect(text).not.toContain(v);
  });

  it('fails closed on an unclassified credential-like variable', () => {
    const td = fixture();
    td.containerDefinitions[0]!.environment!.push({ name: 'NEW_SERVICE_API_KEY', value: 'zzz' });
    expect(() => transformTaskDefinition({ taskDefinition: td, secretArn: ARN, executionRoleArn: EXEC, taskRoleArn: TASK })).toThrow(/NEW_SERVICE_API_KEY/);
  });

  it('refuses the shared execution role, non-FlacronCV roles, a wrong secret and an existing secrets block', () => {
    const base = { taskDefinition: fixture(), secretArn: ARN, executionRoleArn: EXEC, taskRoleArn: TASK };
    expect(() => transformTaskDefinition({ ...base, executionRoleArn: 'arn:aws:iam::111111111111:role/ecsTaskExecutionRole' })).toThrow(/FlacronCV role/);
    expect(() => transformTaskDefinition({ ...base, taskRoleArn: 'arn:aws:iam::111111111111:role/flacronai-ses' })).toThrow(/FlacronCV role/);
    expect(() => transformTaskDefinition({ ...base, secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:flacronai/production/app-AbC123' })).toThrow(/flacroncv\/production\/api/);
    const withSecrets = fixture();
    withSecrets.containerDefinitions[0]!.secrets = [{ name: 'X', valueFrom: 'y' }];
    expect(() => transformTaskDefinition({ ...base, taskDefinition: withSecrets })).toThrow(/already has a secrets block/);
  });

  it('classifies every variable name production revision :89 has (dummy values)', () => {
    const prodNames = ['WATSONX_API_KEY', 'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID', 'STRIPE_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY', 'APPLE_PRO_MONTHLY_PRODUCT_ID',
      'GOOGLE_PRO_MONTHLY_PRODUCT_ID', 'BREVO_TEMPLATE_VERIFICATION', 'BREVO_TEMPLATE_PASSWORD_RESET', 'BREVO_TEMPLATE_WELCOME', 'STRIPE_PORTAL_CONFIGURATION_ID',
      'WATSONX_PROJECT_ID', 'STRIPE_PRO_MONTHLY_PRICE_ID', 'AWS_ACCESS_KEY_ID', 'ADDITIONAL_ORIGINS', 'APPLE_PRIVATE_KEY', 'APPLE_ENTERPRISE_MONTHLY_PRODUCT_ID',
      'FIREBASE_PRIVATE_KEY', 'FIREBASE_PROJECT_ID', 'SES_FROM_EMAIL', 'APPLE_PRO_YEARLY_PRODUCT_ID', 'APPLE_ISSUER_ID', 'APP_ID', 'AWS_REGION',
      'GOOGLE_PLAY_PRIVATE_KEY', 'PORT', 'APPLE_ENTERPRISE_YEARLY_PRODUCT_ID', 'SES_FROM_NAME', 'APPLE_KEY_ID', 'STRIPE_ENTERPRISE_YEARLY_PRICE_ID',
      'FRONTEND_URL', 'BREVO_FROM_EMAIL', 'APPLE_BUNDLE_ID', 'SES_REPLY_TO', 'GOOGLE_PLAY_PACKAGE_NAME', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_CLIENT_EMAIL',
      'GOOGLE_PRO_YEARLY_PRODUCT_ID', 'FIREBASE_STORAGE_BUCKET', 'BREVO_FROM_NAME', 'GOOGLE_ENTERPRISE_MONTHLY_PRODUCT_ID', 'NODE_ENV',
      'GOOGLE_PLAY_CLIENT_EMAIL', 'OPENAI_API_KEY', 'STRIPE_PRO_YEARLY_PRICE_ID', 'BREVO_API_KEY', 'WATSONX_URL'];
    const td = fixture();
    td.containerDefinitions[0]!.environment = prodNames.map((name, i) => ({ name, value: `dummy-value-${i}-xxxxxxxx` }));
    const { secretKeys, removed, register } = transformTaskDefinition({ taskDefinition: td, secretArn: ARN, executionRoleArn: EXEC, taskRoleArn: TASK });
    expect([...secretKeys].sort()).toEqual(['APPLE_PRIVATE_KEY', 'BREVO_API_KEY', 'FIREBASE_PRIVATE_KEY', 'GOOGLE_PLAY_PRIVATE_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'WATSONX_API_KEY']);
    expect(removed).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
    expect((register.containerDefinitions as any[])[0].environment).toHaveLength(prodNames.length - 10);
  });

  it('builds the secret payload from the moved variables only', () => {
    expect(Object.keys(secretPayload(fixture()))).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_PRIVATE_KEY']);
  });
});
