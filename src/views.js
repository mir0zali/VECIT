const config = require('./config');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: config.currency.toUpperCase() });

const CATEGORIES = ['Technology', 'Food & Drink', 'Fashion', 'Finance', 'Automotive', 'Sports', 'Media', 'Retail', 'Travel', 'Health', 'Other'];
const SOURCES = {
  'brand-submitted': 'Submitted by the brand owner',
  'press-kit': 'From the official press kit',
  'public-domain': 'Public domain or open license',
};

function layout({ title, user, csrf, body, q = '', flash = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · ${config.siteName}` : `${config.siteName} · Vector logos for designers`)}</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brandmark" href="/"><img src="/static/favicon.svg" alt="" width="24" height="24">${esc(config.siteName)}</a>
    <form class="search search-top" action="/search" method="get" role="search">
      <label class="sr-only" for="q-top">Search brands</label>
      <input id="q-top" name="q" value="${esc(q)}" placeholder="Search brands" autocomplete="off" data-suggest>
    </form>
    <nav class="nav">
      <a href="/search">Browse</a>
      <a href="/pricing">Pricing</a>
      <a href="/submit">Submit a logo</a>
      ${user
        ? `${user.is_admin ? '<a href="/admin">Admin</a>' : ''}<a href="/account" class="nav-account">${esc(user.name.split(' ')[0])}${user.isPro ? ' <span class="badge">Pro</span>' : ''}</a>`
        : '<a href="/login">Log in</a><a class="btn btn-small" href="/signup">Sign up</a>'}
    </nav>
  </div>
</header>
${config.stripeSecretKey ? '' : '<div class="demo-bar">Demo payments are on. Add Stripe keys to take real (test or live) payments.</div>'}
<main class="wrap">
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <span>© ${new Date().getFullYear()} ${esc(config.siteName)}</span>
    <span>Logos are trademarks of their owners and are provided for identification and client work under each brand's guidelines.</span>
    <a href="/terms">Usage terms</a>
  </div>
</footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

function brandCard(b) {
  return `<a class="card" href="/brand/${esc(b.slug)}">
    <div class="card-art${b.dark_bg ? ' dark' : ''}"><img src="/preview/${b.logo_id}.png" alt="${esc(b.name)} logo" loading="lazy"></div>
    <div class="card-meta"><strong>${esc(b.name)}</strong><span>${esc(b.category)}</span></div>
  </a>`;
}

function grid(brands) {
  return `<div class="grid">${brands.map(brandCard).join('')}</div>`;
}

function home({ popular, latest, counts }) {
  return `
<section class="hero">
  <h1>Every client's logo, ready to edit.</h1>
  <p>Search the library and download clean PNG, JPG, SVG and editable vector files. No more tracing logos by hand.</p>
  <form class="search search-hero" action="/search" method="get" role="search">
    <label class="sr-only" for="q-hero">Search brands</label>
    <input id="q-hero" name="q" placeholder="Search ${counts.brands} brands, e.g. “coffee” or “Northwind”" autocomplete="off" data-suggest>
    <button class="btn" type="submit">Search</button>
  </form>
  <div class="chips">${CATEGORIES.slice(0, 8).map((c) => `<a class="chip" href="/search?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
</section>
<section>
  <div class="section-head"><h2>Popular</h2><a href="/search?sort=popular">See all</a></div>
  ${grid(popular)}
</section>
<section>
  <div class="section-head"><h2>Recently added</h2><a href="/search?sort=new">See all</a></div>
  ${grid(latest)}
</section>
<section class="formats">
  <div><h3>PNG and JPG</h3><p>Transparent PNG or flat JPG, sized to what you need.</p></div>
  <div><h3>SVG</h3><p>Clean, sanitized SVG that drops straight into Figma or the web.</p></div>
  <div><h3>Editable vector</h3><p>PDF that opens as live paths in Illustrator, plus original AI or EPS files where the brand supplied them.</p></div>
</section>`;
}

function search({ q, category, sort, brands }) {
  const heading = q ? `Results for “${esc(q)}”` : category ? esc(category) : 'All brands';
  return `
<div class="search-page">
  <aside class="filters">
    <h2 class="filters-title">Category</h2>
    <a class="${!category ? 'active' : ''}" href="/search?${new URLSearchParams({ q, sort })}">All</a>
    ${CATEGORIES.map((c) => `<a class="${c === category ? 'active' : ''}" href="/search?${new URLSearchParams({ q, category: c, sort })}">${esc(c)}</a>`).join('')}
  </aside>
  <section>
    <div class="section-head">
      <h1 class="h2">${heading} <span class="muted">${brands.length}</span></h1>
      <form method="get" action="/search" class="sort">
        <input type="hidden" name="q" value="${esc(q)}"><input type="hidden" name="category" value="${esc(category)}">
        <label for="sort">Sort</label>
        <select id="sort" name="sort" onchange="this.form.submit()">
          <option value="popular"${sort === 'popular' ? ' selected' : ''}>Most downloaded</option>
          <option value="name"${sort === 'name' ? ' selected' : ''}>Name</option>
          <option value="new"${sort === 'new' ? ' selected' : ''}>Newest</option>
        </select>
      </form>
    </div>
    ${brands.length ? grid(brands) : `
    <div class="empty">
      <h2>No brands match that search</h2>
      <p>Check the spelling, try the company's short name, or ask for it to be added.</p>
      <a class="btn" href="/submit?name=${encodeURIComponent(q)}">Request this logo</a>
    </div>`}
  </section>
</div>`;
}

function formatButtons(logo, user) {
  const pro = user && user.isPro;
  const lock = pro ? '' : ' <span class="lock" title="Pro">Pro</span>';
  const max = pro ? config.proMaxPx : config.freeMaxPx;
  const sizes = [256, 512, 1024, 2048, 4096].filter((s) => s <= config.proMaxPx);
  return `
  <form class="dl" method="get" action="/download/${logo.id}">
    <label class="sr-only" for="size-${logo.id}">Image size</label>
    <select id="size-${logo.id}" name="size">
      ${sizes.map((s) => `<option value="${s}"${s === 1024 ? ' selected' : ''}${s > max ? ' data-pro' : ''}>${s}px${s > max ? ' (Pro)' : ''}</option>`).join('')}
    </select>
    <button class="btn btn-small" name="format" value="png">PNG</button>
    <button class="btn btn-small btn-ghost" name="format" value="jpg">JPG</button>
  </form>
  <div class="dl dl-vector">
    <a class="btn btn-small btn-ghost" href="/download/${logo.id}?format=svg">SVG${lock}</a>
    <a class="btn btn-small btn-ghost" href="/download/${logo.id}?format=pdf">PDF vector${lock}</a>
    ${logo.source_file ? `<a class="btn btn-small btn-ghost" href="/download/${logo.id}?format=source">${esc(logo.source_ext.toUpperCase())} source${lock}</a>` : ''}
  </div>`;
}

function brand({ brand, logos, related, user }) {
  const colors = JSON.parse(brand.colors || '[]');
  return `
<nav class="crumbs"><a href="/search">Brands</a> / <a href="/search?category=${encodeURIComponent(brand.category)}">${esc(brand.category)}</a></nav>
<div class="brand-head">
  <div>
    <h1>${esc(brand.name)}</h1>
    <p class="muted">${esc(brand.description || '')}</p>
    ${brand.website ? `<p><a href="${esc(brand.website)}" rel="nofollow noopener" target="_blank">${esc(brand.website.replace(/^https?:\/\//, ''))}</a></p>` : ''}
  </div>
  <div class="brand-stats"><strong>${brand.downloads.toLocaleString()}</strong><span>downloads</span></div>
</div>
<div class="variants">
  ${logos.map((l) => `
  <article class="variant">
    <div class="variant-art${l.dark_bg ? ' dark' : ''}"><img src="/preview/${l.id}.png" alt="${esc(brand.name)} ${esc(l.variant)} logo"></div>
    <div class="variant-body">
      <h2 class="h3">${esc(l.variant)}</h2>
      ${formatButtons(l, user)}
    </div>
  </article>`).join('')}
</div>
${colors.length ? `
<section>
  <h2>Brand colors</h2>
  <div class="swatches">${colors.map((c) => `
    <button class="swatch" type="button" data-copy="${esc(c.hex)}">
      <span class="swatch-color" style="background:${esc(c.hex)}"></span>
      <span class="swatch-name">${esc(c.name || '')}</span><code>${esc(c.hex)}</code>
    </button>`).join('')}</div>
</section>` : ''}
<section class="license">
  <h2>Usage and license</h2>
  <p><strong>Source:</strong> ${esc(SOURCES[brand.source] || brand.source)}.
  ${brand.guidelines_url ? `<a href="${esc(brand.guidelines_url)}" rel="nofollow noopener" target="_blank">Read the brand guidelines</a>.` : ''}</p>
  <p>The ${esc(brand.name)} name and logo are trademarks of their owner. Use them to represent the brand in client work, follow the brand's guidelines, and don't alter the mark or imply endorsement.</p>
</section>
${related.length ? `<section><div class="section-head"><h2>More in ${esc(brand.category)}</h2></div>${grid(related)}</section>` : ''}`;
}

function pricing({ user, message, csrf }) {
  const pro = user && user.isPro;
  return `
<section class="pricing">
  <h1>Pricing</h1>
  <p class="muted">Browse for free. Upgrade when you need vector files.</p>
  ${message ? `<div class="flash">${esc(message)}</div>` : ''}
  <div class="plans">
    <div class="plan">
      <h2>Free</h2>
      <p class="price">${money(0)}</p>
      <ul>
        <li>PNG and JPG up to ${config.freeMaxPx}px</li>
        <li>${config.freeDailyDownloads} downloads a day</li>
        <li>Brand colors and guidelines</li>
      </ul>
      ${user ? '<p class="muted">Your current plan' + (pro ? ' before Pro' : '') + '.</p>' : '<a class="btn btn-ghost" href="/signup">Create a free account</a>'}
    </div>
    <div class="plan plan-pro">
      <h2>Pro</h2>
      <p class="price">${money(config.proMonthlyPrice)}<span>/month</span></p>
      <ul>
        <li>SVG and editable PDF vectors</li>
        <li>Original AI and EPS source files</li>
        <li>PNG and JPG up to ${config.proMaxPx}px</li>
        <li>Unlimited downloads</li>
      </ul>
      ${pro
        ? '<a class="btn" href="/account">Manage your plan</a>'
        : user
          ? `<form method="post" action="/billing/checkout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn" type="submit">Upgrade to Pro</button></form>`
          : '<a class="btn" href="/signup?next=/pricing">Sign up to upgrade</a>'}
      <p class="fine">Secure card payment by Stripe. Cancel anytime from your account.</p>
    </div>
  </div>
</section>`;
}

function authForm({ mode, error, values = {}, next = '', csrf }) {
  const signup = mode === 'signup';
  return `
<section class="auth">
  <h1>${signup ? 'Create your account' : 'Log in'}</h1>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/${mode}" class="form">
    <input type="hidden" name="_csrf" value="${esc(csrf)}">
    <input type="hidden" name="next" value="${esc(next)}">
    ${signup ? `<label>Name<input name="name" required value="${esc(values.name)}" autocomplete="name"></label>` : ''}
    <label>Email<input name="email" type="email" required value="${esc(values.email)}" autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? 'new-password' : 'current-password'}">
      ${signup ? '<small>At least 8 characters.</small>' : ''}</label>
    <button class="btn" type="submit">${signup ? 'Create account' : 'Log in'}</button>
  </form>
  <p class="muted">${signup ? 'Already have an account? <a href="/login">Log in</a>' : `New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create a free account</a>`}</p>
</section>`;
}

function account({ user, downloads, payments, today, billingMode, csrf }) {
  const date = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `
<h1>Your account</h1>
<div class="account-grid">
  <section class="panel">
    <h2>Plan</h2>
    <p class="plan-line"><strong>${user.isPro ? 'Pro' : 'Free'}</strong>
    ${user.isPro && user.pro_until ? `<span class="muted">until ${date(user.pro_until)}</span>` : ''}</p>
    ${user.isPro ? '' : `<p class="muted">${today} of ${config.freeDailyDownloads} downloads used today.</p>`}
    ${user.isPro
      ? (billingMode === 'demo'
        ? `<form method="post" action="/billing/cancel"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-ghost" type="submit">Cancel Pro</button></form>`
        : `<form method="post" action="/billing/portal"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-ghost" type="submit">Manage billing</button></form>`)
      : '<a class="btn" href="/pricing">Upgrade to Pro</a>'}
  </section>
  <section class="panel">
    <h2>Profile</h2>
    <p>${esc(user.name)}<br><span class="muted">${esc(user.email)}</span></p>
    <form method="post" action="/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-ghost" type="submit">Log out</button></form>
  </section>
</div>
<section>
  <h2>Recent downloads</h2>
  ${downloads.length ? `<table class="table"><thead><tr><th>Brand</th><th>Logo</th><th>Format</th><th>Date</th></tr></thead><tbody>
    ${downloads.map((d) => `<tr><td><a href="/brand/${esc(d.slug)}">${esc(d.name)}</a></td><td>${esc(d.variant)}</td><td>${esc(d.format.toUpperCase())}</td><td>${date(d.created_at)}</td></tr>`).join('')}
  </tbody></table>` : '<p class="muted">Nothing downloaded yet. <a href="/search">Browse the library</a>.</p>'}
</section>
${payments.length ? `<section>
  <h2>Payments</h2>
  <table class="table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
  ${payments.map((p) => `<tr><td>${date(p.created_at)}</td><td>${money(p.amount)}</td><td>${esc(p.status)}${p.provider === 'demo' ? ' (demo)' : ''}</td></tr>`).join('')}
  </tbody></table>
</section>` : ''}`;
}

function brandForm({ action, title, intro, csrf, error, values = {}, admin }) {
  return `
<section class="auth wide">
  <h1>${esc(title)}</h1>
  ${intro ? `<p class="muted">${intro}</p>` : ''}
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="${action}?_csrf=${esc(csrf)}" enctype="multipart/form-data" class="form">
    <label>Brand name<input name="name" required value="${esc(values.name)}"></label>
    <label>Website<input name="website" type="url" placeholder="https://" value="${esc(values.website)}"></label>
    <label>Category<select name="category">${CATEGORIES.map((c) => `<option${c === values.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label>Short description<textarea name="description" rows="2">${esc(values.description)}</textarea></label>
    <label>Brand colors<input name="colors" placeholder="Red #E4002B, Black #111111" value="${esc(values.colors)}"><small>Name and hex, separated by commas.</small></label>
    <label>Where the logo comes from<select name="source">${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}"${k === values.source ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <label>Brand guidelines link<input name="guidelines_url" type="url" placeholder="https://" value="${esc(values.guidelines_url)}"></label>
    <fieldset>
      <legend>Logo files</legend>
      <label>Logo name<input name="variant" value="${esc(values.variant || 'Primary')}"></label>
      <label>SVG file<input name="svg" type="file" accept=".svg,image/svg+xml" required></label>
      <label>Editable source file (optional)<input name="source_file" type="file" accept=".ai,.eps,.pdf"><small>AI, EPS or PDF, up to 25 MB.</small></label>
      <label class="check"><input type="checkbox" name="dark_bg" value="1"${values.dark_bg ? ' checked' : ''}> Logo is meant for dark backgrounds</label>
    </fieldset>
    ${admin ? '' : `<label class="check"><input type="checkbox" name="rights" value="1" required> I own this brand or am authorized to share its logo.</label>`}
    <button class="btn" type="submit">${admin ? 'Publish brand' : 'Submit for review'}</button>
  </form>
</section>`;
}

function admin({ pending, brands, stats, csrf }) {
  return `
<h1>Admin</h1>
<div class="stats">
  <div><strong>${stats.users}</strong><span>users</span></div>
  <div><strong>${stats.pro}</strong><span>Pro members</span></div>
  <div><strong>${stats.brands}</strong><span>brands</span></div>
  <div><strong>${stats.downloads}</strong><span>downloads</span></div>
  <div><strong>${money(stats.revenue)}</strong><span>revenue</span></div>
</div>
<p><a class="btn" href="/admin/new">Add a brand</a></p>
<section>
  <h2>Waiting for review <span class="muted">${pending.length}</span></h2>
  ${pending.length ? `<table class="table"><thead><tr><th>Logo</th><th>Brand</th><th>Source</th><th>Submitted by</th><th></th></tr></thead><tbody>
  ${pending.map((b) => `<tr>
    <td><img class="thumb${b.dark_bg ? ' dark' : ''}" src="/preview/${b.logo_id}.png" alt=""></td>
    <td><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.website || '')}</span></td>
    <td>${esc(SOURCES[b.source] || b.source)}</td>
    <td>${esc(b.submitter || '')}</td>
    <td class="actions">
      <form method="post" action="/admin/brand/${b.id}/approve"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-small" type="submit">Approve</button></form>
      <form method="post" action="/admin/brand/${b.id}/delete" data-confirm="Delete ${esc(b.name)}? This removes its files."><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-small btn-ghost" type="submit">Reject</button></form>
    </td></tr>`).join('')}
  </tbody></table>` : '<p class="muted">No submissions waiting.</p>'}
</section>
<section>
  <h2>Published brands</h2>
  <table class="table"><thead><tr><th>Brand</th><th>Category</th><th>Downloads</th><th></th></tr></thead><tbody>
  ${brands.map((b) => `<tr><td><a href="/brand/${esc(b.slug)}">${esc(b.name)}</a></td><td>${esc(b.category)}</td><td>${b.downloads}</td>
    <td class="actions">
      <a class="btn btn-small btn-ghost" href="/admin/brand/${b.id}/logo">Add logo</a>
      <form method="post" action="/admin/brand/${b.id}/delete" data-confirm="Delete ${esc(b.name)} and all its logos?"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button class="btn btn-small btn-ghost" type="submit">Delete</button></form>
    </td></tr>`).join('')}
  </tbody></table>
</section>`;
}

function addLogo({ brand, csrf, error }) {
  return `
<section class="auth">
  <h1>Add a logo to ${esc(brand.name)}</h1>
  ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
  <form method="post" action="/admin/brand/${brand.id}/logo?_csrf=${esc(csrf)}" enctype="multipart/form-data" class="form">
    <label>Logo name<input name="variant" required placeholder="Icon, Wordmark, White"></label>
    <label>SVG file<input name="svg" type="file" accept=".svg,image/svg+xml" required></label>
    <label>Editable source file (optional)<input name="source_file" type="file" accept=".ai,.eps,.pdf"></label>
    <label class="check"><input type="checkbox" name="dark_bg" value="1"> Logo is meant for dark backgrounds</label>
    <button class="btn" type="submit">Add logo</button>
  </form>
</section>`;
}

function demoCheckout({ sessionId, user, csrf }) {
  return `
<section class="auth">
  <p class="badge-demo">Demo checkout</p>
  <h1>${esc(config.siteName)} Pro</h1>
  <p class="price">${money(config.proMonthlyPrice)}<span>/month</span></p>
  <p class="muted">This stands in for Stripe Checkout until Stripe keys are added. No card is charged.</p>
  <form method="post" action="/billing/demo-pay" class="form">
    <input type="hidden" name="_csrf" value="${esc(csrf)}">
    <input type="hidden" name="session_id" value="${esc(sessionId)}">
    <label>Email<input value="${esc(user.email)}" disabled></label>
    <label>Card number<input value="4242 4242 4242 4242" disabled></label>
    <button class="btn" type="submit">Pay ${money(config.proMonthlyPrice)}</button>
  </form>
  <p><a href="/pricing?canceled=1">Cancel and go back</a></p>
</section>`;
}

function message({ title, text, link }) {
  return `<section class="empty"><h1 class="h2">${esc(title)}</h1><p>${esc(text)}</p>${link ? `<a class="btn" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}</section>`;
}

function terms() {
  return `
<section class="prose">
  <h1>Usage terms</h1>
  <p>Every logo in ${esc(config.siteName)} is a trademark of the company it belongs to. We collect logos from brand owners and official press kits so designers can represent those brands accurately.</p>
  <h2>You may</h2>
  <ul><li>Use a logo to identify the brand in client work, presentations, mockups, editorial and partner materials.</li><li>Resize it and convert it between file formats.</li></ul>
  <h2>You may not</h2>
  <ul><li>Alter, distort or recolor a mark beyond what the brand's guidelines allow.</li><li>Use a logo in a way that suggests the brand endorses you or your client.</li><li>Use a logo in your own trademark, product or merchandise for sale.</li></ul>
  <h2>What a Pro plan pays for</h2>
  <p>A Pro plan pays for our service: preparing, cleaning and converting files and keeping the library current. It doesn't grant any trademark rights; those stay with each brand.</p>
  <h2>Brand owners</h2>
  <p>If you own a brand in the library and want a logo updated or removed, <a href="/submit">submit the new file</a> or contact us and we'll act on it.</p>
</section>`;
}

module.exports = {
  esc, layout, home, search, brand, pricing, authForm, account, brandForm, admin, addLogo, demoCheckout, message, terms, CATEGORIES, SOURCES,
};
