// Central settings. Everything here can be overridden with environment variables.
module.exports = {
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  siteName: process.env.SITE_NAME || 'Vectorly',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Pricing (amounts in the smallest currency unit, e.g. cents).
  currency: process.env.CURRENCY || 'usd',
  proMonthlyPrice: Number(process.env.PRO_MONTHLY_PRICE || 900),

  // Free plan limits.
  freeDailyDownloads: Number(process.env.FREE_DAILY_DOWNLOADS || 10),
  freeMaxPx: 1024,
  proMaxPx: 4096,

  // First account registered with this email becomes an admin.
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
};
