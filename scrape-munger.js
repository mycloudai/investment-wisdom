// 爬取 munger.ayaseeri.com 全站文章转 Markdown
const fs = require('fs');
const path = require('path');

const BASE = 'https://munger.ayaseeri.com';
const OUT = path.join(__dirname, 'munger-ayaseeri');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- HTML → Markdown ----------
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
    const r = resolveLink(href, curCat);
    return r ? `[${t}](${r})` : t;
  });
  return s.replace(/<[^>]+>/g, '');
}
function tidyInline(s) {
  return decodeEntities(s).split('\n').map(l => l.replace(/[ \t\r]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1)).join('\n').trim();
}
function blockToMd(html, curCat) {
  let s = html;
  // 清理：评论区/脚本/按钮/侧栏/表单/svg/页头
  s = s.replace(/<(script|style|noscript|button|svg|aside|input|label|form|header)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(input|img)\b[^>]*>/gi, m => m.startsWith('<img') ? m : '');
  s = s.replace(/<section class="article-comments"[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, ''); // 标题单独写
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
  const a = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (a) return a[1];
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i); // 特殊页无 article，用 main 兜底
  return m ? m[1] : null;
}
function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '').trim());
  const t = html.match(/<title>([^<]*)<\/title>/i);
  return t ? t[1].split('｜')[0].replace(/^首页 \| /, '').trim() : '';
}

// ---------- URL 列表 + 分类 ----------
function extractUrls() {
  const seen = new Map();
  const collect = (file, onlyThinking) => {
    const html = fs.readFileSync(file, 'utf8');
    const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let p = safeDecode(m[1].split('#')[0]).replace(/\/$/, '');
      const name = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!name || !p.startsWith('/')) continue;
      if (onlyThinking && !/^\/thinking-grids\/.+/.test(p)) continue;
      if (!onlyThinking) {
        // 只收文章页：sources/*、articles/*、topics、特殊页（thinking-grids 子页从专页提取）
        const ok = /^\/(sources|articles)\/.+/.test(p) ||
          /^\/(stop-doing|book-list)$/.test(p) ||
          /^\/topics(\/.+)?$/.test(p) ||
          p === '/sources/seeking-wisdom-中文版';
        if (!ok) continue;
      }
      if (!seen.has(p)) seen.set(p, name);
    }
  };
  collect('/tmp/munger-home.html', false);
  collect('/tmp/mg-thinking-grids.html', true); // 思维格栅 178 个子页
  return [...seen.entries()].map(([p, name]) => ({ path: p, name }));
}
function catOf(p, name) {
  if (/^\/thinking-grids\/.+/.test(p)) return 'thinking-grids';
  if (/^\/topics(\/.+)?$/.test(p)) return 'topics';
  if (/^\/(thinking-grids|stop-doing|book-list)$/.test(p) || p.includes('seeking-wisdom')) return 'guides';
  if (p.startsWith('/articles/')) return 'articles';
  if (name.includes('致股东信')) return 'letters';
  if (name.includes('股东会')) return 'meetings';
  if (name.startsWith('李录') || name.includes('李录')) return 'li-lu';
  return 'speeches';
}
const catName = {
  speeches: '演讲与访谈',
  letters: '致股东信',
  meetings: '股东会讲话',
  'li-lu': '李录（芒格传承）',
  articles: '主题解读',
  'thinking-grids': '思维格栅',
  topics: '主题专题',
  guides: '指南与书单',
};
function relPath(curCat, target) {
  const d = curCat.split('/').filter(Boolean);
  const t = target.split('/');
  let i = 0;
  while (i < d.length && i < t.length - 1 && d[i] === t[i]) i++;
  return d.slice(i).map(() => '..').concat(t.slice(i)).join('/');
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
const SLUG_MAP = (() => {
  const items = extractUrls();
  const totals = {};
  for (const it of items) totals[catOf(it.path, it.name)] = (totals[catOf(it.path, it.name)] || 0) + 1;
  const counters = {};
  const map = {};
  for (const it of items) {
    const cat = catOf(it.path, it.name);
    counters[cat] = (counters[cat] || 0) + 1;
    const num = String(counters[cat]).padStart(String(totals[cat]).length, '0');
    const base = it.path.split('/').pop() || it.path.replace(/\//g, '');
    map[it.path] = cat + '/' + num + '-' + base + '.md';
  }
  return map;
})();
function resolveLink(href, curCat) {
  if (!href) return href;
  if (href.startsWith('#')) return href;
  if (/^mailto:/i.test(href)) return href;
  // 本站绝对 URL 解包，与相对路径统一处理
  let rest = null;
  const abs = href.match(/^https?:\/\/munger\.ayaseeri\.com(\/[^#]*)?(#.*)?$/i);
  if (abs) rest = (abs[1] || '/') + (abs[2] || '');
  else if (/^https?:/i.test(href)) return href;
  else rest = href;
  const hash = rest.indexOf('#');
  const raw = hash >= 0 ? rest.slice(0, hash) : rest;
  const anchor = hash >= 0 ? rest.slice(hash) : '';
  const p = safeDecode(raw).replace(/\.html?$/i, '').replace(/\/$/, '');
  if (!p || p === '/') return BASE + '/';
  const target = SLUG_MAP[p];
  if (!target) {
    if (/\.html?$/i.test(raw)) return null; // 站内 html 文件（无对应页面）→ 降级纯文本
    return BASE + encodeURI(p) + anchor;
  }
  return relPath(curCat, target);
}

// ---------- 主流程 ----------
(async () => {
  const items = extractUrls();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'munger-urls.json'), JSON.stringify(items, null, 1));
  const index = [];
  let ok = 0, fail = 0;
  for (const it of items) {
    const cat = catOf(it.path, it.name);
    const dir = path.join(OUT, cat);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(SLUG_MAP[it.path]));
    try {
      const res = await fetch(BASE + encodeURI(it.path), { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const body = extractArticle(html);
      if (!body) throw new Error('no article body');
      const title = it.name || extractTitle(html);
      const md = `# ${title}\n\n> 来源：${BASE + encodeURI(it.path)}\n\n${blockToMd(body, cat)}\n`;
      fs.writeFileSync(file, md);
      index.push({ cat, file: path.basename(file), slug: it.path, title });
      ok++;
      process.stdout.write(`\r${ok + fail}/${items.length} ok=${ok} fail=${fail} ${title.slice(-20)}        `);
    } catch (e) {
      fail++;
      console.log(`\nFAIL ${it.path}: ${e.message}`);
    }
    await sleep(350);
  }
  fs.writeFileSync(path.join(__dirname, 'munger-index.json'), JSON.stringify(index, null, 1));
  console.log(`\nDONE ok=${ok} fail=${fail}`);
})();
