export default () => ({
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    // Trimmed. A trailing space or stray carriage return in .env (or pasted
    // into a hosting dashboard's env editor) is invisible on screen but changes
    // the HMAC key, so every signature check fails with a mismatch error that
    // gives no hint the secret itself is malformed.
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    prices: {
      proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      enterpriseMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      enterpriseYearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    },
  },

  // Transactional email — AWS SES (replaced Brevo). Templates are rendered in
  // MailService as inline HTML, so there are no provider-side template IDs.
  ses: {
    region: process.env.AWS_REGION || 'us-east-1',
    // Optional: when omitted, the AWS SDK falls back to its default credential
    // chain (instance/task role), which is preferable in production.
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    fromEmail: process.env.SES_FROM_EMAIL || 'no-reply@flacronenterprises.com',
    fromName: process.env.SES_FROM_NAME || 'FlacronAI',
    replyTo: process.env.SES_REPLY_TO || 'support@flacronenterprises.com',
    // Inbox that public contact-form submissions are delivered to.
    contactTo:
      process.env.CONTACT_EMAIL ||
      process.env.SES_REPLY_TO ||
      'support@flacronenterprises.com',
  },
});
