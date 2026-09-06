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

  // Apple IAP + Google Play Billing. Optional at boot — Stripe must keep
  // starting without these. POST /billing/mobile/verify fails closed (503)
  // when they are missing. Never log the key material.
  iap: {
    apple: {
      bundleId: process.env.APPLE_BUNDLE_ID?.trim(),
      issuerId: process.env.APPLE_ISSUER_ID?.trim(),
      keyId: process.env.APPLE_KEY_ID?.trim(),
      privateKey: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      products: {
        proMonthly: process.env.APPLE_PRO_MONTHLY_PRODUCT_ID?.trim(),
        proYearly: process.env.APPLE_PRO_YEARLY_PRODUCT_ID?.trim(),
        enterpriseMonthly: process.env.APPLE_ENTERPRISE_MONTHLY_PRODUCT_ID?.trim(),
        enterpriseYearly: process.env.APPLE_ENTERPRISE_YEARLY_PRODUCT_ID?.trim(),
      },
    },
    google: {
      packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim(),
      clientEmail: process.env.GOOGLE_PLAY_CLIENT_EMAIL?.trim(),
      privateKey: process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      rtdnAudience: process.env.GOOGLE_RTDN_AUDIENCE?.trim(),
      rtdnServiceAccount: process.env.GOOGLE_RTDN_SERVICE_ACCOUNT?.trim(),
      products: {
        proMonthly: process.env.GOOGLE_PRO_MONTHLY_PRODUCT_ID?.trim(),
        proYearly: process.env.GOOGLE_PRO_YEARLY_PRODUCT_ID?.trim(),
        enterpriseMonthly: process.env.GOOGLE_ENTERPRISE_MONTHLY_PRODUCT_ID?.trim(),
        enterpriseYearly: process.env.GOOGLE_ENTERPRISE_YEARLY_PRODUCT_ID?.trim(),
      },
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
    // Last hardcoded fallback is the customer-facing inbox, not SES_FROM_*.
    contactTo:
      process.env.CONTACT_EMAIL ||
      process.env.SES_REPLY_TO ||
      'contact@flacroncv.com',
  },

  // HMAC key for hashing device tokens and IPs before any user-doc write.
  // Trimmed for the same reason STRIPE_WEBHOOK_SECRET is: a stray space would
  // silently mint a different hash and split one device into two. If unset or
  // blank, signup still succeeds and scoring is skipped (fail soft).
  abuseHmacSecret: process.env.ABUSE_HMAC_SECRET?.trim(),
});
