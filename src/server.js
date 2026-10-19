const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const config = require('./config');
const { db } = require('./db');
const auth = require('./auth');
const billing = require('./billing');
const render = require('./render');
const views = require('./views');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Stripe needs the raw body to verify the webhook signature, so this route comes first.
app.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const type = await billing.handleWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true, type });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook error: ${err.message}`);
  }
});

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  next();
});
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use(auth.loadUser);

// Multipart forms carry the CSRF token in the query string so it can be checked before parsing.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const token = (req.body && req.body._csrf) || req.query._csrf;
  if (token !== req.csrf) return res.status(403).send(page(req, 'Form expired', views.message({
    title: 'This form expired', text: 'Refresh the page and try again.', link: { href: req.get('referer') || '/', label: 'Go back' },
  })));
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 2 },
});

function page(req, title, body, extra = {}) {
  return views.layout({ title, user: req.user, csrf: req.csrf, body, ...extra });
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const BRAND_LIST_SQL = `
  SELECT b.*, l.id AS logo_id, l.dark_bg FROM brands b
  JOIN logos l ON l.id = (SELECT id FROM logos WHERE brand_id = b.id ORDER BY id LIMIT 1)
  WHERE b.status = 'published'`;

function slugify(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-') || 'brand';
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM brands WHERE slug = ?').get(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function parseColors(text) {
  return String(text || '').split(',').map((part) => {
    const hex = (part.match(/#?[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0];
    if (!hex) return null;
    return { name: part.replace(hex, '').trim(), hex: (hex.startsWith('#') ? hex : `#${hex}`).toUpperCase() };
  }).filter(Boolean);
}

// ---------- Browsing ----------

app.get('/', (req, res) => {
  const popular = db.prepare(`${BRAND_LIST_SQL} ORDER BY b.downloads DESC, b.name LIMIT 8`).all();
  const latest = db.prepare(`${BRAND_LIST_SQL} ORDER BY b.created_at DESC, b.id DESC LIMIT 8`).all();
  const counts = { brands: db.prepare("SELECT COUNT(*) AS n FROM brands WHERE status = 'published'").get().n };
  res.send(page(req, '', views.home({ popular, latest, counts })));
});

function searchBrands({ q = '', category = '', sort = 'popular', limit = 200 }) {
  const order = { name: 'b.name COLLATE NOCASE', new: 'b.created_at DESC, b.id DESC', popular: 'b.downloads DESC, b.name' }[sort] || 'b.downloads DESC';
  const params = [];
  let where = '';
  if (q) {
    where += " AND (b.name LIKE ? OR b.description LIKE ? OR b.category LIKE ? OR b.website LIKE ?)";
    const like = `%${q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like, like);
  }
  if (category) { where += ' AND b.category = ?'; params.push(category); }
  // Exact and prefix name matches first when searching.
  const rank = q ? `CASE WHEN b.name LIKE ? THEN 0 WHEN b.name LIKE ? THEN 1 ELSE 2 END, ` : '';
  if (q) params.push(q, `${q}%`);
  return db.prepare(`${BRAND_LIST_SQL}${where} ORDER BY ${rank}${order} LIMIT ${Number(limit)}`).all(...params);
}

app.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const category = views.CATEGORIES.includes(req.query.category) ? req.query.category : '';
  const sort = ['popular', 'name', 'new'].includes(req.query.sort) ? req.query.sort : 'popular';
  const brands = searchBrands({ q, category, sort });
  res.send(page(req, q ? `Search: ${q}` : 'Browse brands', views.search({ q, category, sort, brands }), { q }));
});

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (!q) return res.json([]);
  res.json(searchBrands({ q, limit: 6 }).map((b) => ({ name: b.name, slug: b.slug, category: b.category, logo: `/preview/${b.logo_id}.png` })));
});

app.get('/brand/:slug', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE slug = ?').get(req.params.slug);
  if (!brand || (brand.status !== 'published' && !req.user?.is_admin)) return notFound(req, res);
  const logos = db.prepare('SELECT * FROM logos WHERE brand_id = ? ORDER BY id').all(brand.id);
  const related = db.prepare(`${BRAND_LIST_SQL} AND b.category = ? AND b.id != ? ORDER BY b.downloads DESC LIMIT 4`).all(brand.category, brand.id);
  res.send(page(req, brand.name, views.brand({ brand, logos, related, user: req.user })));
});

app.get('/preview/:id.png', asyncRoute(async (req, res) => {
  const logo = db.prepare('SELECT * FROM logos WHERE id = ?').get(Number(req.params.id));
  if (!logo) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(await render.previewPath(logo));
}));

app.get('/terms', (req, res) => res.send(page(req, 'Usage terms', views.terms())));

// ---------- Downloads ----------

const PRO_FORMATS = new Set(['svg', 'pdf', 'source']);

app.get('/download/:id', asyncRoute(async (req, res) => {
  const logo = db.prepare(`SELECT l.*, b.slug, b.name, b.status FROM logos l JOIN brands b ON b.id = l.brand_id WHERE l.id = ?`).get(Number(req.params.id));
  if (!logo || logo.status !== 'published') return notFound(req, res);
  const format = String(req.query.format || 'png');
  if (!['png', 'jpg', 'svg', 'pdf', 'source'].includes(format)) return res.status(400).send('Unknown format');
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(`/brand/${logo.slug}`)}&reason=download`);

  const pro = req.user.isPro;
  const size = Math.min(config.proMaxPx, Math.max(64, Number(req.query.size) || 1024));
  if (!pro && (PRO_FORMATS.has(format) || size > config.freeMaxPx)) {
    return res.redirect('/pricing?need=pro');
  }
  if (!pro) {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const used = db.prepare('SELECT COUNT(*) AS n FROM downloads WHERE user_id = ? AND created_at >= ?').get(req.user.id, since.getTime()).n;
    if (used >= config.freeDailyDownloads) return res.redirect('/pricing?need=limit');
  }

  const variant = logo.variant.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const base = `${logo.slug}-${variant}`;
  let body, type, filename;
  if (format === 'svg') {
    body = render.readSvg(logo.svg_file); type = 'image/svg+xml'; filename = `${base}.svg`;
  } else if (format === 'pdf') {
    body = await render.toPdf(logo.svg_file); type = 'application/pdf'; filename = `${base}.pdf`;
  } else if (format === 'source') {
    if (!logo.source_file) return notFound(req, res);
    body = fs.readFileSync(path.join(render.SOURCE_DIR, logo.source_file)); type = 'application/octet-stream'; filename = `${base}.${logo.source_ext}`;
  } else {
    body = await render.toRaster(logo.svg_file, format, size); type = format === 'png' ? 'image/png' : 'image/jpeg'; filename = `${base}-${size}px.${format}`;
  }

  db.prepare('INSERT INTO downloads (user_id, logo_id, format, created_at) VALUES (?, ?, ?, ?)').run(req.user.id, logo.id, format, Date.now());
  db.prepare('UPDATE brands SET downloads = downloads + 1 WHERE id = ?').run(logo.brand_id);
  res.set({
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Cache-Control': 'private, no-store',
  });
  res.send(body);
}));

// ---------- Accounts ----------

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

app.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/account');
  res.send(page(req, 'Sign up', views.authForm({ mode: 'signup', next: req.query.next || '', csrf: req.csrf })));
});

app.post('/signup', (req, res) => {
  const { name = '', email = '', password = '', next } = req.body;
  const fail = (error) => res.status(400).send(page(req, 'Sign up', views.authForm({ mode: 'signup', error, values: { name, email }, next, csrf: req.csrf })));
  if (!name.trim()) return fail('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail('Enter a valid email address, like name@studio.com.');
  if (password.length < 8) return fail('Use a password with at least 8 characters.');
  if (auth.findUserByEmail(email)) return fail('An account with that email already exists. Log in instead.');
  const id = auth.createUser({ name, email, password });
  auth.createSession(res, id);
  res.redirect(safeNext(next));
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/account');
  const error = req.query.reason === 'download' ? 'Log in or create a free account to download logos.' : '';
  res.send(page(req, 'Log in', views.authForm({ mode: 'login', next: req.query.next || '', csrf: req.csrf, error })));
});

app.post('/login', (req, res) => {
  const { email = '', password = '', next } = req.body;
  const user = auth.findUserByEmail(email);
  if (!user || !auth.verifyPassword(password, user.pass_hash)) {
    return res.status(400).send(page(req, 'Log in', views.authForm({
      mode: 'login', error: "That email and password don't match. Check them and try again.", values: { email }, next, csrf: req.csrf,
    })));
  }
  auth.createSession(res, user.id);
  res.redirect(safeNext(next));
});

app.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.redirect('/');
});

app.get('/account', auth.requireUser, (req, res) => {
  const downloads = db.prepare(`
    SELECT d.*, l.variant, b.name, b.slug FROM downloads d JOIN logos l ON l.id = d.logo_id JOIN brands b ON b.id = l.brand_id
    WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 25`).all(req.user.id);
  const payments = db.prepare("SELECT * FROM payments WHERE user_id = ? AND status = 'paid' ORDER BY created_at DESC").all(req.user.id);
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const today = db.prepare('SELECT COUNT(*) AS n FROM downloads WHERE user_id = ? AND created_at >= ?').get(req.user.id, since.getTime()).n;
  const flash = req.query.upgraded ? 'Welcome to Pro. SVG, PDF and source files are now unlocked.' : req.query.canceled ? 'Pro is canceled. You are on the Free plan.' : '';
  res.send(page(req, 'Account', views.account({ user: req.user, downloads, payments, today, billingMode: billing.mode, csrf: req.csrf }), { flash }));
});

// ---------- Payments ----------

app.get('/pricing', (req, res) => {
  const message = {
    pro: 'SVG, PDF vectors, source files and large images are part of Pro.',
    limit: `You've used today's ${config.freeDailyDownloads} free downloads. Upgrade for unlimited downloads, or come back tomorrow.`,
  }[req.query.need] || (req.query.canceled ? 'Checkout canceled. You were not charged.' : '');
  res.send(page(req, 'Pricing', views.pricing({ user: req.user, message, csrf: req.csrf })));
});

app.post('/billing/checkout', auth.requireUser, asyncRoute(async (req, res) => {
  if (req.user.isPro) return res.redirect('/account');
  res.redirect(303, await billing.startCheckout(req.user));
}));

app.get('/billing/success', auth.requireUser, asyncRoute(async (req, res) => {
  const ok = await billing.confirmCheckout(req.user, String(req.query.session_id || ''));
  res.redirect(ok ? '/account?upgraded=1' : '/pricing?canceled=1');
}));

app.get('/billing/demo-checkout', auth.requireUser, (req, res) => {
  if (billing.mode !== 'demo') return notFound(req, res);
  res.send(page(req, 'Checkout', views.demoCheckout({ sessionId: req.query.session_id, user: req.user, csrf: req.csrf })));
});

app.post('/billing/demo-pay', auth.requireUser, (req, res) => {
  if (billing.mode !== 'demo') return notFound(req, res);
  res.redirect(`/billing/success?session_id=${encodeURIComponent(req.body.session_id)}`);
});

app.post('/billing/portal', auth.requireUser, asyncRoute(async (req, res) => {
  const url = await billing.portalUrl(req.user);
  res.redirect(303, url || '/account');
}));

app.post('/billing/cancel', auth.requireUser, (req, res) => {
  if (billing.mode !== 'demo') return notFound(req, res);
  billing.cancelDemo(req.user);
  res.redirect('/account?canceled=1');
});

// ---------- Logo submissions and admin ----------

function saveLogo(brandId, files, body) {
  const svgUpload = files?.svg?.[0];
  if (!svgUpload) throw new Error('Choose an SVG file.');
  const svg = render.sanitizeSvg(svgUpload.buffer.toString('utf8'));
  const key = crypto.randomBytes(8).toString('hex');
  const svgFile = `${key}.svg`;
  fs.writeFileSync(path.join(render.LOGO_DIR, svgFile), svg);

  let sourceFile = null, sourceExt = null;
  const src = files?.source_file?.[0];
  if (src) {
    sourceExt = path.extname(src.originalname).slice(1).toLowerCase();
    if (!['ai', 'eps', 'pdf'].includes(sourceExt)) throw new Error('The source file must be AI, EPS or PDF.');
    sourceFile = `${key}.${sourceExt}`;
    fs.writeFileSync(path.join(render.SOURCE_DIR, sourceFile), src.buffer);
  }
  db.prepare('INSERT INTO logos (brand_id, variant, dark_bg, svg_file, source_file, source_ext, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(brandId, (body.variant || 'Primary').trim().slice(0, 40), body.dark_bg ? 1 : 0, svgFile, sourceFile, sourceExt, Date.now());
}

function createBrand(req, status) {
  const b = req.body;
  if (!b.name || !b.name.trim()) throw new Error('Enter the brand name.');
  if (!req.files?.svg?.[0]) throw new Error('Choose an SVG file.');
  render.sanitizeSvg(req.files.svg[0].buffer.toString('utf8')); // validate before creating the brand
  const category = views.CATEGORIES.includes(b.category) ? b.category : 'Other';
  const source = views.SOURCES[b.source] ? b.source : 'brand-submitted';
  const url = (u) => (/^https?:\/\//i.test(u || '') ? u.trim() : null);
  const info = db.prepare(`INSERT INTO brands (slug, name, website, category, description, colors, source, guidelines_url, status, submitted_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    slugify(b.name), b.name.trim().slice(0, 80), url(b.website), category, (b.description || '').trim().slice(0, 300),
    JSON.stringify(parseColors(b.colors)), source, url(b.guidelines_url), status, req.user.id, Date.now());
  const id = Number(info.lastInsertRowid);
  saveLogo(id, req.files, b);
  return id;
}

const logoFields = upload.fields([{ name: 'svg', maxCount: 1 }, { name: 'source_file', maxCount: 1 }]);

app.get('/submit', auth.requireUser, (req, res) => {
  res.send(page(req, 'Submit a logo', views.brandForm({
    action: '/submit', title: 'Submit a logo', csrf: req.csrf, values: { name: req.query.name || '' },
    intro: 'Own a brand, or have its official press kit? Share the logo here. We review every submission before it goes live.',
  })));
});

app.post('/submit', auth.requireUser, logoFields, (req, res) => {
  try {
    if (!req.body.rights) throw new Error('Confirm that you are allowed to share this logo.');
    createBrand(req, 'pending');
    res.send(page(req, 'Thanks', views.message({ title: 'Thanks, we got it', text: "We'll review the logo and publish it once it checks out.", link: { href: '/', label: 'Back to the library' } })));
  } catch (err) {
    res.status(400).send(page(req, 'Submit a logo', views.brandForm({ action: '/submit', title: 'Submit a logo', csrf: req.csrf, error: err.message, values: req.body })));
  }
});

app.get('/admin', auth.requireAdmin, (req, res) => {
  const pending = db.prepare(`
    SELECT b.*, l.id AS logo_id, l.dark_bg, u.email AS submitter FROM brands b
    JOIN logos l ON l.id = (SELECT id FROM logos WHERE brand_id = b.id ORDER BY id LIMIT 1)
    LEFT JOIN users u ON u.id = b.submitted_by WHERE b.status = 'pending' ORDER BY b.created_at`).all();
  const brands = db.prepare("SELECT * FROM brands WHERE status = 'published' ORDER BY name COLLATE NOCASE").all();
  const one = (sql) => db.prepare(sql).get().n;
  const stats = {
    users: one('SELECT COUNT(*) AS n FROM users'),
    pro: one("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'"),
    brands: brands.length,
    downloads: one('SELECT COUNT(*) AS n FROM downloads'),
    revenue: one("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE status = 'paid' AND provider = 'stripe'"),
  };
  res.send(page(req, 'Admin', views.admin({ pending, brands, stats, csrf: req.csrf })));
});

app.get('/admin/new', auth.requireAdmin, (req, res) => {
  res.send(page(req, 'Add a brand', views.brandForm({ action: '/admin/new', title: 'Add a brand', csrf: req.csrf, admin: true })));
});

app.post('/admin/new', auth.requireAdmin, logoFields, (req, res) => {
  try {
    const id = createBrand(req, 'published');
    res.redirect(`/brand/${db.prepare('SELECT slug FROM brands WHERE id = ?').get(id).slug}`);
  } catch (err) {
    res.status(400).send(page(req, 'Add a brand', views.brandForm({ action: '/admin/new', title: 'Add a brand', csrf: req.csrf, error: err.message, values: req.body, admin: true })));
  }
});

app.get('/admin/brand/:id/logo', auth.requireAdmin, (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(Number(req.params.id));
  if (!brand) return notFound(req, res);
  res.send(page(req, 'Add a logo', views.addLogo({ brand, csrf: req.csrf })));
});

app.post('/admin/brand/:id/logo', auth.requireAdmin, logoFields, (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(Number(req.params.id));
  if (!brand) return notFound(req, res);
  try {
    saveLogo(brand.id, req.files, req.body);
    res.redirect(`/brand/${brand.slug}`);
  } catch (err) {
    res.status(400).send(page(req, 'Add a logo', views.addLogo({ brand, csrf: req.csrf, error: err.message })));
  }
});

app.post('/admin/brand/:id/approve', auth.requireAdmin, (req, res) => {
  db.prepare("UPDATE brands SET status = 'published', created_at = ? WHERE id = ?").run(Date.now(), Number(req.params.id));
  res.redirect('/admin');
});

app.post('/admin/brand/:id/delete', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  for (const l of db.prepare('SELECT * FROM logos WHERE brand_id = ?').all(id)) {
    fs.rmSync(path.join(render.LOGO_DIR, l.svg_file), { force: true });
    if (l.source_file) fs.rmSync(path.join(render.SOURCE_DIR, l.source_file), { force: true });
    render.clearPreview(l.id);
  }
  db.prepare('DELETE FROM brands WHERE id = ?').run(id);
  res.redirect('/admin');
});

// ---------- Errors ----------

function notFound(req, res) {
  res.status(404).send(page(req, 'Not found', views.message({ title: "We couldn't find that page", text: 'It may have been moved or removed.', link: { href: '/search', label: 'Browse brands' } })));
}
app.use(notFound);

app.use((err, req, res, next) => {
  console.error(err);
  const text = err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 25 MB. Upload a smaller file.' : 'Something went wrong on our side. Try again in a moment.';
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 400 : 500).send(page(req, 'Error', views.message({ title: 'That didn’t work', text, link: { href: '/', label: 'Back to the library' } })));
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.siteName} running at ${config.baseUrl} (payments: ${billing.mode})`);
  });
}

module.exports = app;
