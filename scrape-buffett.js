// 爬取 buffett.ayaseeri.com 全站文章转 Markdown
const fs = require('fs');
const path = require('path');

const BASE = 'https://buffett.ayaseeri.com';
const OUT = path.join(__dirname, 'buffett-ayaseeri');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- HTML → Markdown（与 scrape.js 同逻辑） ----------
function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&ldquo;|&#8220;/g, '“').replace(/&rdquo;|&#8221;/g, '”')
    .replace(/&lsquo;|&#8216;/g, '‘').replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&hellip;|&#8230;/g, '…').replace(/&mdash;/g, '—').replace(/&middot;/g, '·')
    .replace(/&#x?[0-9a-f]+;/gi, '');
}
function inlineToMd(html, curCat) {
  let s = html;
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<img\b[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, (_, src, alt) => `![${alt}](${resolveLink(src, curCat)})`);
  s = s.replace(/<img\b[^>]*src="([^"]*)"[^>]*>/gi, (_, src) => `![](${resolveLink(src, curCat)})`);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, t, c) => '**' + c.replace(/<[^>]+>/g, '').trim() + '**');
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, t, c) => '*' + c.replace(/<[^>]+>/g, '').trim() + '*');
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => '`' + c.trim() + '`');
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    return `[${t}](${resolveLink(href, curCat)})`;
  });
  return s.replace(/<[^>]+>/g, '');
}
function tidyInline(s) {
  return decodeEntities(s).split('\n').map(l => l.replace(/[ \t\r]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1)).join('\n').trim();
}
function blockToMd(html, curCat) {
  let s = html;
  s = s.replace(/<section class="article-comments"[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  let out = [];
  const blockRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>|<(ol|ul)\b[^>]*>([\s\S]*?)<\/\5>|<hr\s*\/?>|<(table)\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m, last = 0;
  const push = t => { if (t.trim()) out.push(t.trim()); };
  while ((m = blockRe.exec(s)) !== null) {
    const before = s.slice(last, m.index).replace(/<[^>]+>/g, '').trim();
    if (before) push(decodeEntities(before));
    if (m[1]) {
      const level = '#'.repeat(+m[1][1]);
      const inner = m[2].replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
      push(`${level} ${tidyInline(inlineToMd(inner, curCat)).replace(/\n/g, ' ')}`);
    } else if (m[3] !== undefined) {
      push(tidyInline(inlineToMd(m[3], curCat)));
    } else if (m[4] !== undefined) {
      const inner = tidyInline(inlineToMd(m[4], curCat));
      push(inner.split('\n').map(l => '> ' + l).join('\n'));
    } else if (m[5] !== undefined) {
      const ordered = m[5].toLowerCase() === 'ol';
      const lis = m[6].match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) || [];
      lis.forEach((liTag, i) => {
        const liInner = liTag.replace(/^<li\b[^>]*>|<\/li>$/gi, '');
        const text = tidyInline(inlineToMd(liInner, curCat)).replace(/\n/g, ' ');
        const marker = ordered ? `${i + 1}. ` : '- ';
        if (text) out.push(marker + text);
      });
    } else if (m[7] !== undefined) {
      const rows = m[8].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const tableRows = rows.map((r, ri) => {
        const cells = (r.match(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
          .map(c => tidyInline(inlineToMd(c.replace(/^<t[hd]\b[^>]*>|<\/t[hd]>$/gi, ''), curCat)).replace(/\n/g, ' ') || ' ');
        return '| ' + cells.join(' | ') + ' |' + (ri === 0 ? '\n|' + cells.map(() => ' --- ').join('|') + '|' : '');
      });
      push(tableRows.join('\n'));
    } else {
      push('---');
    }
    last = blockRe.lastIndex;
  }
  const tail = s.slice(last).replace(/<[^>]+>/g, '').trim();
  if (tail) push(decodeEntities(tail));
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
function extractArticle(html) {
  const m = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  return m ? m[1] : null;
}
function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '').trim());
  const t = html.match(/<title>([^<]*)<\/title>/i);
  return t ? t[1].split('｜')[0].trim() : '';
}

// ---------- URL 列表 + 分类 ----------
const catName = {
  interviews: '访谈与演讲',
  letters: '致股东信',
  'partner-letters': '致合伙人信',
  meetings: '股东大会',
  articles: '主题解读',
};
function extractUrls() {
  const html = fs.readFileSync('/tmp/buffett-home.html', 'utf8');
  const seen = new Map();
  const re = /<a\b[^>]*href="(\/(?:sources|articles)\/[a-z0-9/-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const p = m[1].replace(/\/$/, '');
    const name = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!seen.has(p) && name) seen.set(p, name);
  }
  return [...seen.entries()].map(([p, name]) => ({ path: p, name }));
}
function catOf(p) {
  if (p.startsWith('/sources/')) return p.split('/')[2];
  return 'articles';
}
const SLUG_MAP = (() => {
  const counters = {};
  const map = {};
  for (const it of extractUrls()) {
    const cat = catOf(it.path);
    counters[cat] = (counters[cat] || 0) + 1;
    const num = String(counters[cat]).padStart(2, '0');
    map[it.path] = cat + '/' + num + '-' + it.path.split('/').pop() + '.md';
  }
  return map;
})();
function resolveLink(href, curCat) {
  if (!href) return href;
  if (/^(https?:|#|mailto:)/.test(href)) return href;
  const p = href.replace(/\/$/, '');
  if (!p || !p.startsWith('/')) return href;
  const target = SLUG_MAP[p];
  if (!target) return BASE + p;
  const parts = target.split('/');
  return parts[0] === curCat ? parts[1] : '../' + target;
}

// ---------- 主流程 ----------
(async () => {
  const items = extractUrls();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'buffett-urls.json'), JSON.stringify(items, null, 1));
  const index = [];
  let ok = 0, fail = 0;
  for (const it of items) {
    const cat = catOf(it.path);
    const dir = path.join(OUT, cat);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(SLUG_MAP[it.path]));
    try {
      const res = await fetch(BASE + it.path, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const body = extractArticle(html);
      if (!body) throw new Error('no article body');
      const title = it.name || extractTitle(html);
      const md = `# ${title}\n\n> 来源：${BASE + it.path}\n\n${blockToMd(body, cat)}\n`;
      fs.writeFileSync(file, md);
      index.push({ cat, file: path.basename(file), slug: it.path, title });
      ok++;
      process.stdout.write(`\r${ok + fail}/${items.length} ok=${ok} fail=${fail} ${it.path.slice(-30)}        `);
    } catch (e) {
      fail++;
      console.log(`\nFAIL ${it.path}: ${e.message}`);
    }
    await sleep(350);
  }
  fs.writeFileSync(path.join(__dirname, 'buffett-index.json'), JSON.stringify(index, null, 1));
  console.log(`\nDONE ok=${ok} fail=${fail}`);
})();
