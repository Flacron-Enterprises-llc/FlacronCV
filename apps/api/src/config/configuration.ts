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

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  watsonx: {
    apiKey: process.env.WATSONX_API_KEY,
    url: process.env.WATSONX_URL,
    projectId: process.env.WATSONX_PROJECT_ID,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    prices: {
      proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      enterpriseMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      enterpriseYearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    },
  },

  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL || 'noreply@flacroncv.com',
    fromName: process.env.BREVO_FROM_NAME || 'FlacronCV',
    templates: {
      welcome: parseInt(process.env.BREVO_TEMPLATE_WELCOME || '0', 10),
      verification: parseInt(process.env.BREVO_TEMPLATE_VERIFICATION || '0', 10),
      passwordReset: parseInt(process.env.BREVO_TEMPLATE_PASSWORD_RESET || '0', 10),
    },
  },
});
