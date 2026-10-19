const crypto = require('crypto');
const config = require('./config');
const { db } = require('./db');

const stripe = config.stripeSecretKey ? require('stripe')(config.stripeSecretKey) : null;
const mode = stripe ? (config.stripeSecretKey.startsWith('sk_live') ? 'live' : 'test') : 'demo';

function recordPayment(userId, checkoutId, amount, currency, status, provider) {
  db.prepare(`
    INSERT INTO payments (user_id, checkout_id, amount, currency, status, provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(checkout_id) DO UPDATE SET status = excluded.status
  `).run(userId, checkoutId, amount, currency, status, provider, Date.now());
}

function activatePro(userId, { customerId = null, subscriptionId = null, until = null } = {}) {
  db.prepare(`
    UPDATE users SET plan = 'pro', pro_until = ?,
      stripe_customer_id = COALESCE(?, stripe_customer_id),
      stripe_subscription_id = COALESCE(?, stripe_subscription_id)
    WHERE id = ?
  `).run(until, customerId, subscriptionId, userId);
}

function deactivatePro(where, value) {
  db.prepare(`UPDATE users SET plan = 'free', pro_until = NULL, stripe_subscription_id = NULL WHERE ${where} = ?`).run(value);
}

// Returns the URL to send the shopper to.
async function startCheckout(user) {
  if (!stripe) {
    const id = 'demo_' + crypto.randomBytes(12).toString('hex');
    recordPayment(user.id, id, config.proMonthlyPrice, config.currency, 'open', 'demo');
    return `/billing/demo-checkout?session_id=${id}`;
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: user.stripe_customer_id || undefined,
    customer_email: user.stripe_customer_id ? undefined : user.email,
    client_reference_id: String(user.id),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: config.currency,
        unit_amount: config.proMonthlyPrice,
        recurring: { interval: 'month' },
        product_data: { name: `${config.siteName} Pro`, description: 'Unlimited SVG, PDF and source file downloads' },
      },
    }],
    allow_promotion_codes: true,
    success_url: `${config.baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/pricing?canceled=1`,
  });
  recordPayment(user.id, session.id, config.proMonthlyPrice, config.currency, 'open', 'stripe');
  return session.url;
}

// Called on the success redirect, so Pro unlocks right away even before the webhook arrives.
async function confirmCheckout(user, sessionId) {
  const payment = db.prepare('SELECT * FROM payments WHERE checkout_id = ? AND user_id = ?').get(sessionId, user.id);
  if (!payment) return false;
  if (payment.provider === 'demo') {
    recordPayment(user.id, sessionId, payment.amount, payment.currency, 'paid', 'demo');
    activatePro(user.id, { until: Date.now() + 31 * 864e5 });
    return true;
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  return applyCompletedSession(session);
}

function applyCompletedSession(session) {
  const userId = Number(session.client_reference_id);
  if (!userId || session.payment_status !== 'paid') return false;
  const sub = typeof session.subscription === 'object' ? session.subscription : null;
  recordPayment(userId, session.id, session.amount_total ?? config.proMonthlyPrice, session.currency || config.currency, 'paid', 'stripe');
  activatePro(userId, {
    customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    subscriptionId: sub ? sub.id : session.subscription,
    until: null, // kept active until Stripe tells us the subscription ended
  });
  return true;
}

async function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured');
  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      applyCompletedSession(obj);
      break;
    case 'customer.subscription.updated':
      if (['active', 'trialing'].includes(obj.status)) {
        db.prepare("UPDATE users SET plan = 'pro', pro_until = NULL WHERE stripe_customer_id = ?").run(obj.customer);
      } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(obj.status)) {
        deactivatePro('stripe_customer_id', obj.customer);
      }
      break;
    case 'customer.subscription.deleted':
      deactivatePro('stripe_customer_id', obj.customer);
      break;
  }
  return event.type;
}

async function portalUrl(user) {
  if (!stripe || !user.stripe_customer_id) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${config.baseUrl}/account`,
  });
  return session.url;
}

function cancelDemo(user) {
  deactivatePro('id', user.id);
}

module.exports = { mode, startCheckout, confirmCheckout, handleWebhook, portalUrl, cancelDemo };
