// DesignDaily — collecte des articles côté serveur (GitHub Actions, toutes les 30 minutes).
// Lit sources.json, va chercher chaque flux RSS (ou la page d'accueil du site), complète les articles
// sans date/extrait/image en lisant leur page, puis écrit articles.json que l'application télécharge.
// Aucune dépendance : Node 20 ou plus récent suffit.
import fs from 'node:fs';
import path from 'node:path';

const [, , SRC = 'sources.json', PREV = 'previous.json', OUT = 'out/articles.json'] = process.argv;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PER_SOURCE = 50;        // articles gardés par source
const ENRICH_PER_RUN = 80;    // pages d'articles lues au maximum par passage
const NOW = Date.now();

// ── Réseau ──────────────────────────────────────────────────────────────
async function get(url, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8', 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    // Encodage : en-tête HTTP, sinon déclaration dans le document, sinon UTF-8
    const head = buf.subarray(0, 2048).toString('latin1');
    const cs = (r.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1]
      || head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1]
      || head.match(/<meta[^>]*charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
    let text;
    try { text = new TextDecoder(cs.toLowerCase()).decode(buf); } catch { text = buf.toString('utf8'); }
    return { text, url: r.url || url };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'délai dépassé' : (e.cause?.code || e.message));
  } finally { clearTimeout(t); }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ── Texte ───────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', oelig: 'œ', euro: '€', copy: '©', reg: '®', deg: '°' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
function plain(html) {
  let t = cdata(html).replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  t = decode(decode(t)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.replace(/(The post .{0,200} appeared first on .*|L’article .{0,200} est apparu en premier sur .*|Cet article .{0,200} est apparu en premier sur .*|Continue reading.*|Read more.*|Lire la suite.*|\[(…|\.\.\.)\].*)$/i, '').trim();
}
function clip(t, n) { if (t.length <= n) return t; const c = t.slice(0, n); const k = c.lastIndexOf(' '); return (k > n * 0.6 ? c.slice(0, k) : c).replace(/[ ,;:.\-–]+$/, '') + '…'; }
function abs(u, base) { if (!String(u || '').trim()) return ''; try { const x = new URL(decode(String(u || '').trim()), base); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } }
// Clé de comparaison d'une adresse : sans http(s), sans www, sans barre finale ni paramètres (sauf ?p=123 de WordPress)
const key = u => {
  let s = String(u || '').replace(/#.*$/, '');
  const q = s.match(/\?(.*)$/)?.[1] || ''; s = s.replace(/\?.*$/, '');
  const p = q.match(/(?:^|&)(p=\d+|feed=[\w-]+)/)?.[1];
  return (s.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '') + (p ? '?' + p : '')).toLowerCase();
};

// ── Dates ───────────────────────────────────────────────────────────────
const MOIS = { janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11, january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11, jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const UNITES = { second: 1e3, seconde: 1e3, minute: 6e4, min: 6e4, hour: 36e5, heure: 36e5, day: 864e5, jour: 864e5, week: 6048e5, semaine: 6048e5, month: 2592e6, mois: 2592e6, year: 31536e6, an: 31536e6, 'année': 31536e6 };
function parseDate(v) {
  let t = plain(v); if (!t) return 0;
  const low = t.toLowerCase(); let m;
  if (/^(yesterday|hier)$/.test(low)) return NOW - 864e5;
  if (/ago$|il y a/.test(low) && (m = low.match(/(\d+|an?|une?)\s*(seconde|second|minute|min|heure|hour|jour|day|semaine|week|mois|month|année|year|an)s?(?:\s+ago)?$/))) return NOW - (/^\d+$/.test(m[1]) ? +m[1] : 1) * UNITES[m[2]];
  if ((m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/))) return Date.UTC(+m[3], +m[2] - 1, +m[1], 12);
  const d = /\b(19|20)\d{2}\b/.test(t) ? new Date(t).getTime() : NaN;
  if (!isNaN(d)) return (d > NOW + 864e5 || d < 8e11) ? 0 : d;
  if ((m = low.match(/(\d{1,2})(?:er|st|nd|rd|th)?\s+([a-zéûôà]+)\.?,?\s+(\d{4})/)) && MOIS[m[2]] !== undefined) return Date.UTC(+m[3], MOIS[m[2]], +m[1], 12);
  if ((m = low.match(/([a-zéûôà]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)) && MOIS[m[1]] !== undefined) return Date.UTC(+m[3], MOIS[m[1]], +m[2], 12);
  return 0;
}
const iso = ts => (ts ? new Date(ts).toISOString() : '');

// ── Flux RSS / Atom ─────────────────────────────────────────────────────
const tag = (xml, name) => { const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i')); return m ? m[1] : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp('<' + name + '\\b[^>]*?\\s' + a + '=["\']([^"\']+)["\']', 'i')); return m ? decode(m[1]) : ''; };
function parseFeed(xml, base) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const title = plain(tag(b, 'title')) || 'Sans titre';
    let link = plain(tag(b, 'link'));
    if (!/^https?:/i.test(link)) {
      const alt = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)?.[0] || b.match(/<link\b[^>]*href=[^>]*>/i)?.[0] || '';
      link = alt.match(/href=["']([^"']+)["']/i)?.[1] || plain(tag(b, 'guid'));
    }
    const full = tag(b, 'content:encoded');
    const descRaw = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || full;
    const html = decode(cdata(descRaw + ' ' + full));
    let img = '';
    const enc = b.match(/<enclosure\b[^>]*>/i)?.[0] || '';
    if (/type=["']image\//i.test(enc) || /url=["'][^"']+\.(jpe?g|png|webp|gif)/i.test(enc)) img = enc.match(/url=["']([^"']+)["']/i)?.[1] || '';
    img = img || attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || html.match(/<img\b[^>]*?\ssrc=["']([^"']+)["']/i)?.[1] || '';
    if (/\.(mp3|mp4|m4a|ogg|wav)(\?|$)/i.test(img)) img = '';
    const ts = parseDate(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    return { title, url: abs(link, base), ts, description: clip(plain(descRaw), 600), img: abs(img, base) };
  }).filter(a => a.url);
}

// ── Lecture d'une page d'accueil (sites sans flux RSS) ──────────────────
function scrapeHome(html, base) {
  const host = new URL(base).hostname.replace(/^www\./, '');
  const out = []; const seen = new Set();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html)) && out.length < 60) {
    const href = m[1].match(/href=["']([^"']+)["']/i)?.[1]; if (!href) continue;
    const url = abs(href, base); if (!url) continue;
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, '') !== host) continue;
    const segs = u.pathname.split('/').filter(Boolean);
    const looks = segs.some(x => (x.match(/-/g) || []).length >= 2) || /[?&]p=\d+/.test(u.search) || /\d{5,}/.test(segs[segs.length - 1] || '');
    if (!looks || /\/(tag|tags|category|categorie|author|auteur|page|search)\//i.test(u.pathname)) continue;
    let title = plain(m[2]);
    if (title.length < 25) title = decode(m[1].match(/title=["']([^"']+)["']/i)?.[1] || m[2].match(/<img\b[^>]*alt=["']([^"']+)["']/i)?.[1] || title).trim();
    if (title.length < 25 || title.length > 220) continue;
    const k = key(url); if (seen.has(k) || seen.has(title)) continue;
    seen.add(k); seen.add(title);
    const im = m[2].match(/<img\b[^>]*>/i)?.[0] || '';
    const src = im.match(/\sdata-src=["']([^"']+)["']/i)?.[1] || im.match(/\ssrcset=["']([^"'\s,]+)/i)?.[1] || im.match(/\ssrc=["']([^"']+)["']/i)?.[1] || '';
    out.push({ title, url, ts: 0, description: '', img: /^data:/.test(src) ? '' : abs(src, base) });
  }
  return out;
}

// ── Lecture d'une page d'article : date, image, extrait ─────────────────
function articleInfo(html, url) {
  const meta = (...names) => { for (const n of names) { const t = html.match(new RegExp('<meta\\b[^>]*(?:property|name|itemprop)=["\']' + n.replace(/[.:]/g, '\\$&') + '["\'][^>]*>', 'i'))?.[0]; const v = t?.match(/content=["']([^"']*)["']/i)?.[1]; if (v && v.trim()) return decode(v.trim()); } return ''; };
  const d = meta('article:published_time', 'og:article:published_time', 'datePublished', 'date', 'DC.date.issued', 'publish-date', 'parsely-pub-date')
    || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
    || html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] || '';
  const body = (html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html)
    .replace(/<(script|style|nav|header|footer|aside|form|figure|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  const paras = (body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map(plain).filter(t => t.length > 60);
  const text = paras.slice(0, 4).join(' ');
  const summary = plain(meta('og:description', 'description', 'twitter:description'));
  return { ts: parseDate(d), img: abs(meta('og:image', 'twitter:image'), url), description: clip(text.length >= 120 ? text : (summary.length >= 40 ? summary : text), 600) };
}

// ── Une source ──────────────────────────────────────────────────────────
function siteHome(feed) {
  if (feed.site) return feed.site;
  try { const u = new URL(feed.url); const p = u.pathname.replace(/\/[^\/]*\.(xml|rss|atom)$/i, '').replace(/\/(feed|rss|atom)\/?$/i, ''); return u.origin + (p || '/'); } catch { return feed.url; }
}
async function collectFeed(feed) {
  const errors = [];
  if (feed.mode !== 'page') {
    try {
      const { text, url } = await get(feed.url);
      const arts = parseFeed(text, url);
      if (arts.length) return { arts, via: 'rss' };
      errors.push('flux vide ou illisible');
    } catch (e) { errors.push('flux : ' + e.message); }
  }
  try {
    const home = siteHome(feed);
    const { text, url } = await get(home);
    // La page annonce un flux RSS : on l'utilise
    if (feed.mode !== 'page') {
      const l = text.match(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i)?.[0];
      const href = l?.match(/href=["']([^"']+)["']/i)?.[1];
      const rss = href && abs(href, url);
      if (rss && key(rss) !== key(feed.url)) {
        try { const f = await get(rss); const arts = parseFeed(f.text, f.url); if (arts.length) return { arts, via: 'rss' }; } catch (e) { errors.push('flux annoncé : ' + e.message); }
      }
    }
    const arts = scrapeHome(text, url);
    if (arts.length) return { arts, via: 'page' };
    errors.push('page : aucun article reconnu');
  } catch (e) { errors.push('page : ' + e.message); }
  throw new Error(errors.join(' · '));
}

// ── Programme ───────────────────────────────────────────────────────────
const sources = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const folders = Array.isArray(sources) ? sources : (sources.folders || []);
const feeds = folders.flatMap(f => (f.feeds || []).map(fd => ({ ...fd, folderId: f.id, folder: f.name })));
let prev = {}; try { prev = JSON.parse(fs.readFileSync(PREV, 'utf8')); } catch { }
const prevArts = Array.isArray(prev.articles) ? prev.articles : [];
const prevByKey = new Map(prevArts.map(a => [key(a.url), a]));

const status = []; let all = []; let budget = ENRICH_PER_RUN;
await pool(feeds, 6, async feed => {
  const fk = key(feed.url);
  const old = prevArts.filter(a => a.feed === fk);
  try {
    const { arts, via } = await collectFeed(feed);
    const seenKeys = new Set(); const list = [];
    arts.forEach((a, idx) => {
      const k = key(a.url); if (seenKeys.has(k)) return; seenKeys.add(k);
      const p = prevByKey.get(k);
      list.push({
        title: a.title, url: a.url, source: feed.title, feed: fk,
        pubDate: iso(a.ts) || p?.pubDate || '',
        // Sans date lisible : on retient le moment où la collecte a vu l'article pour la première fois
        seen: p?.seen || (old.length ? NOW - idx * 1000 : 0),
        description: (a.description.length >= (p?.description || '').length ? a.description : p.description) || '',
        img: a.img || p?.img || '', checked: !!p?.checked,
      });
    });
    // On garde aussi les articles récents sortis du flux
    old.forEach(a => { const k = key(a.url); if (!seenKeys.has(k)) { seenKeys.add(k); list.push(a); } });
    // Compléter les articles incomplets (les premiers de la liste d'abord), une seule fois chacun
    const todo = list.slice(0, 20).filter(a => !a.checked && (!a.pubDate || a.description.length < 80 || !a.img));
    await pool(todo, 4, async a => {
      if (budget-- <= 0) return;
      a.checked = true;
      try {
        const { text, url } = await get(a.url, 15000);
        const info = articleInfo(text, url);
        if (!a.pubDate && info.ts) a.pubDate = iso(info.ts);
        if (a.description.length < 80 && info.description.length > a.description.length) a.description = info.description;
        if (!a.img && info.img) a.img = info.img;
      } catch { }
    });
    const ord = a => Date.parse(a.pubDate) || a.seen || 0;
    list.sort((a, b) => ord(b) - ord(a));
    const kept = list.slice(0, PER_SOURCE);
    all.push(...kept);
    status.push({ title: feed.title, url: feed.url, feed: fk, ok: true, via, count: kept.length });
    console.log('✓', feed.title, '—', arts.length, 'articles', '(' + via + ')');
  } catch (e) {
    all.push(...old);
    status.push({ title: feed.title, url: feed.url, feed: fk, ok: false, count: old.length, error: e.message });
    console.log('✗', feed.title, '—', e.message);
  }
});

const ord = a => Date.parse(a.pubDate) || a.seen || 0;
all.sort((a, b) => ord(b) - ord(a));
const order = new Map(feeds.map((f, i) => [key(f.url), i]));
status.sort((a, b) => order.get(a.feed) - order.get(b.feed));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: 1, generatedAt: new Date(NOW).toISOString(), sources: status, articles: all }));
const okN = status.filter(s => s.ok).length;
console.log('\n' + okN + '/' + status.length + ' sources chargées — ' + all.length + ' articles écrits dans ' + OUT);
// Si tout a échoué (panne réseau du serveur), on ne publie rien : la collecte précédente reste en place
if (!okN && status.length) process.exit(1);
