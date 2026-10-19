// Fills an empty library with sample brands (fictional, original artwork) and an admin account.
// Run with: npm run seed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./db');
const auth = require('./auth');
const render = require('./render');

const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Each icon is drawn in a 100x100 box. `c` is the brand's color list.
const brands = [
  {
    name: 'Northwind Coffee', category: 'Food & Drink', website: 'https://example.com/northwind',
    description: 'Small-batch coffee roaster with cafés across the north coast.',
    colors: [['Roast', '#5B3A29'], ['Crema', '#F3E6D3'], ['Ink', '#1B1410']],
    icon: (c) => `<circle cx="50" cy="50" r="48" fill="${c[0]}"/><ellipse cx="50" cy="50" rx="20" ry="30" fill="${c[1]}" transform="rotate(30 50 50)"/><path d="M40 25 C 58 40, 42 60, 60 75" stroke="${c[0]}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  },
  {
    name: 'Lumen Bank', category: 'Finance', website: 'https://example.com/lumen',
    description: 'Digital-first bank for freelancers and small studios.',
    colors: [['Navy', '#0B2A5B'], ['Gold', '#E8B04B']],
    icon: (c) => `<rect x="2" y="2" width="96" height="96" rx="22" fill="${c[0]}"/><path d="M32 24 h12 v40 h26 v12 H32z" fill="#fff"/><circle cx="68" cy="34" r="9" fill="${c[1]}"/>`,
  },
  {
    name: 'Orbita', category: 'Technology', website: 'https://example.com/orbita',
    description: 'Satellite data platform for logistics teams.',
    colors: [['Violet', '#6C3CF0'], ['Night', '#16123A'], ['Signal', '#3DE0C5']],
    icon: (c) => `<circle cx="50" cy="50" r="22" fill="${c[0]}"/><ellipse cx="50" cy="50" rx="46" ry="18" fill="none" stroke="${c[1]}" stroke-width="6" transform="rotate(-25 50 50)"/><circle cx="88" cy="32" r="7" fill="${c[2]}"/>`,
    wordColor: 1,
  },
  {
    name: 'Pinecrest Outfitters', category: 'Retail', website: 'https://example.com/pinecrest',
    description: 'Outdoor clothing and camping gear since 1984.',
    colors: [['Forest', '#1F5C3A'], ['Moss', '#8DB580'], ['Bark', '#3A2A1E']],
    icon: (c) => `<path d="M30 12 L58 88 H2z" fill="${c[1]}"/><path d="M62 4 L98 88 H26z" fill="${c[0]}"/><rect x="58" y="88" width="8" height="10" fill="${c[2]}"/>`,
  },
  {
    name: 'Velo Motors', category: 'Automotive', website: 'https://example.com/velo',
    description: 'Electric city cars and scooters.',
    colors: [['Velo Red', '#D7263D'], ['Graphite', '#1E1E24']],
    icon: (c) => `<path d="M4 20 h26 l20 40 l20 -40 h26 l-36 70 h-20z" fill="${c[0]}"/><path d="M38 20 h24 l-12 24z" fill="${c[1]}"/>`,
    wordColor: 1, dark: true,
  },
  {
    name: 'Kite Air', category: 'Travel', website: 'https://example.com/kiteair',
    description: 'Regional airline connecting island destinations.',
    colors: [['Sky', '#1FA2FF'], ['Deep', '#0A4C8C'], ['Sun', '#FFC83D']],
    icon: (c) => `<path d="M50 2 L86 40 L50 98 L14 40z" fill="${c[0]}"/><path d="M50 2 L86 40 L50 50z" fill="${c[1]}"/><path d="M14 40 L50 50 L50 98z" fill="${c[2]}"/>`,
    wordColor: 1,
  },
  {
    name: 'Bloomfield Health', category: 'Health', website: 'https://example.com/bloomfield',
    description: 'Community clinics and telehealth.',
    colors: [['Teal', '#12A38A'], ['Mint', '#BFEFE3']],
    icon: (c) => [0, 72, 144, 216, 288].map((r) => `<ellipse cx="50" cy="27" rx="15" ry="24" fill="${c[0]}" opacity=".85" transform="rotate(${r} 50 50)"/>`).join('') + `<circle cx="50" cy="50" r="10" fill="#fff"/>`,
  },
  {
    name: 'Halftime Sports', category: 'Sports', website: 'https://example.com/halftime',
    description: 'Sports network covering grassroots leagues.',
    colors: [['Blaze', '#FF6B1A'], ['Pitch', '#101418']],
    icon: (c) => `<circle cx="50" cy="50" r="46" fill="${c[1]}"/><path d="M50 4 A46 46 0 0 1 50 96z" fill="${c[0]}"/><circle cx="50" cy="50" r="12" fill="#fff"/>`,
    wordColor: 1, dark: true,
  },
  {
    name: 'Pulse Media', category: 'Media', website: 'https://example.com/pulse',
    description: 'Podcast studio and audio publisher.',
    colors: [['Magenta', '#E5197D'], ['Plum', '#3B0A2A']],
    icon: (c) => [18, 34, 50, 66, 82].map((x, i) => { const h = [30, 70, 92, 56, 24][i]; return `<rect x="${x - 6}" y="${50 - h / 2}" width="12" height="${h}" rx="6" fill="${c[0]}"/>`; }).join(''),
    wordColor: 1,
  },
  {
    name: 'Atelier Mono', category: 'Fashion', website: 'https://example.com/atelier',
    description: 'Paris-based label for minimal tailoring.',
    colors: [['Noir', '#111111'], ['Bone', '#EDE8DF']],
    icon: (c) => `<rect x="2" y="2" width="96" height="96" fill="${c[0]}"/><text x="50" y="66" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-size="46" fill="${c[1]}">AM</text>`,
    wordFont: "Georgia, 'DejaVu Serif', serif",
  },
  {
    name: 'Ferro Pizza', category: 'Food & Drink', website: 'https://example.com/ferro',
    description: 'Wood-fired pizza, fast-casual.',
    colors: [['Tomato', '#E23D28'], ['Crust', '#F4B942'], ['Basil', '#2E7D32']],
    icon: (c) => `<path d="M50 96 L8 14 Q50 -6 92 14z" fill="${c[1]}"/><path d="M50 84 L16 20 Q50 4 84 20z" fill="${c[0]}"/><circle cx="40" cy="30" r="7" fill="${c[1]}"/><circle cx="60" cy="44" r="6" fill="${c[1]}"/><circle cx="50" cy="62" r="5" fill="${c[1]}"/><path d="M62 22 q6 -6 12 0 q-6 6 -12 0z" fill="${c[2]}"/>`,
  },
  {
    name: 'Cobalt Cloud', category: 'Technology', website: 'https://example.com/cobalt',
    description: 'Managed hosting for agencies.',
    colors: [['Cobalt', '#0047AB'], ['Ice', '#DCE8FA']],
    icon: (c) => `<path d="M28 78 a22 22 0 0 1 -2 -44 a28 28 0 0 1 52 6 a19 19 0 0 1 -2 38z" fill="${c[0]}"/><path d="M40 60 l10 -12 l10 12" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
];

const svgDoc = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

function horizontal(b, c, textColor) {
  const fontSize = 44;
  const textW = Math.ceil(b.name.length * fontSize * 0.58);
  const w = 130 + textW;
  return svgDoc(w, 120, `<g transform="translate(10 10)">${b.icon(c)}</g>` +
    `<text x="128" y="76" font-family="${b.wordFont || FONT}" font-size="${fontSize}" font-weight="700" letter-spacing="-1" fill="${textColor}">${b.name}</text>`);
}

function writeLogo(brandId, variant, svg, dark) {
  const file = `${crypto.randomBytes(8).toString('hex')}.svg`;
  fs.writeFileSync(path.join(render.LOGO_DIR, file), render.sanitizeSvg(svg));
  db.prepare('INSERT INTO logos (brand_id, variant, dark_bg, svg_file, created_at) VALUES (?, ?, ?, ?, ?)').run(brandId, variant, dark ? 1 : 0, file, Date.now());
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM brands').get().n > 0) {
    console.log('Library already has brands; skipping sample brands.');
  } else {
    const now = Date.now();
    brands.forEach((b, i) => {
      const c = b.colors.map((x) => x[1]);
      const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const info = db.prepare(`INSERT INTO brands (slug, name, website, category, description, colors, source, status, downloads, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'brand-submitted', 'published', ?, ?)`).run(
        slug, b.name, b.website, b.category, b.description,
        JSON.stringify(b.colors.map(([name, hex]) => ({ name, hex }))), Math.floor(Math.random() * 900) + 40, now - i * 36e5);
      const id = Number(info.lastInsertRowid);
      const word = b.wordColor !== undefined ? c[b.wordColor] : c[c.length > 2 ? 2 : 0];
      writeLogo(id, 'Primary', horizontal(b, c, word));
      writeLogo(id, 'Icon', svgDoc(120, 120, `<g transform="translate(10 10)">${b.icon(c)}</g>`));
      if (b.dark) writeLogo(id, 'Reversed', horizontal(b, c, '#ffffff'), true);
    });
    console.log(`Added ${brands.length} sample brands.`);
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@vectorly.local').toLowerCase();
  if (!auth.findUserByEmail(email)) {
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const id = auth.createUser({ email, name: 'Admin', password });
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(id);
    console.log(`Admin account: ${email} / ${password}`);
  }
}

seed();
