// 爬取 duan.ayaseeri.com 全站文章转 Markdown
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'duan-ayaseeri');
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
    return `[${t}](${resolveLink(href, curCat)})`;
  });
  // 去掉剩余标签但保留 br 产生的换行
  return s.replace(/<[^>]+>/g, '');
}
// 段落级文本清理：合并纯空白，但保留 br 转出的换行
function tidyInline(s) {
  return decodeEntities(s).split('\n').map(l => l.replace(/[ \t\r]+/g, ' ').trim()).filter((l, i, a) => l || (i > 0 && i < a.length - 1)).join('\n').trim();
}
function blockToMd(html, curCat) {
  let s = html;
  // 去掉评论区与脚本样式
  s = s.replace(/<section class="article-comments"[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  let out = [];
  // 按块级标签切（含 ol/ul 整体匹配以区分有序/无序）
  const blockRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>|<(ol|ul)\b[^>]*>([\s\S]*?)<\/\5>|<hr\s*\/?>|<(table)\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m, last = 0;
  const push = t => { if (t.trim()) out.push(t.trim()); };
  while ((m = blockRe.exec(s)) !== null) {
    const before = s.slice(last, m.index).replace(/<[^>]+>/g, '').trim();
    if (before) push(decodeEntities(before));
    if (m[1]) { // heading（剥掉内层链接壳，标题文字保真）
      const level = '#'.repeat(+m[1][1]);
      const inner = m[2].replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
      push(`${level} ${tidyInline(inlineToMd(inner, curCat)).replace(/\n/g, ' ')}`);
    } else if (m[3] !== undefined) { // p
      push(tidyInline(inlineToMd(m[3], curCat)));
    } else if (m[4] !== undefined) { // blockquote：保留内部换行，逐行 >
      const inner = tidyInline(inlineToMd(m[4], curCat));
      push(inner.split('\n').map(l => '> ' + l).join('\n'));
    } else if (m[5] !== undefined) { // ol/ul 列表
      const ordered = m[5].toLowerCase() === 'ol';
      const lis = m[6].match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) || [];
      lis.forEach((liTag, i) => {
        const liInner = liTag.replace(/^<li\b[^>]*>|<\/li>$/gi, '');
        const text = tidyInline(inlineToMd(liInner, curCat)).replace(/\n/g, ' ');
        const marker = ordered ? `${i + 1}. ` : '- ';
        if (text) out.push(marker + text);
      });
    } else if (m[7] !== undefined) { // table：简单转 md 表格
      const rows = m[8].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const tableRows = rows.map((r, ri) => {
        const cells = (r.match(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
          .map(c => tidyInline(inlineToMd(c.replace(/^<t[hd]\b[^>]*>|<\/t[hd]>$/gi, ''), curCat)).replace(/\n/g, ' ') || ' ');
        return '| ' + cells.join(' | ') + ' |' + (ri === 0 ? '\n|' + cells.map(() => ' --- ').join('|') + '|' : '');
      });
      push(tableRows.join('\n'));
    } else { // hr
      push('---');
    }
    last = blockRe.lastIndex;
  }
  const tail = s.slice(last).replace(/<[^>]+>/g, '').trim();
  if (tail) push(decodeEntities(tail));
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
function extractArticle(html) {
  let m = html.match(/<article class="article-body"[^>]*>([\s\S]*?)<\/article>/i);
  if (!m) m = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  return m ? m[1] : null;
}
function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '').trim());
  const t = html.match(/<title>([^<]*)<\/title>/i);
  return t ? t[1].split('｜')[0].trim() : '';
}

// ---------- 分类 ----------
function categoryOf(slug) {
  if (/^wenda-/.test(slug)) return 'wenda';            // 投资问答录系列
  if (/^(company|person|gongsi|tim-cook|shenwei|feidele)-/.test(slug)) return 'renwu-gongsi'; // 人物与公司
  if (/^(duanyongping|buffett)-/.test(slug)) return 'yanjiang-fangtan'; // 演讲访谈
  return 'zhuti';                                       // 主题页
}

// ---------- 站内链接 → md 相对路径 ----------
const SLUG_MAP = (() => {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'urls.json'), 'utf8'));
  const map = {};
  for (const it of items) {
    const slug = it.url.replace('https://duan.ayaseeri.com/', '').replace(/\/$/, '');
    if (slug) map[slug] = categoryOf(slug) + '/' + slug + '.md';
  }
  return map;
})();
function resolveLink(href, curCat) {
  if (!href) return href;
  if (/^(https?:|#|mailto:)/.test(href)) return href; // 外链/锚点原样
  const slug = href.replace(/^\//, '').replace(/\/$/, '');
  if (!slug) return 'https://duan.ayaseeri.com/';
  const target = SLUG_MAP[slug];
  if (!target) return 'https://duan.ayaseeri.com/' + slug; // 不在列表的站内页回退到原站
  const parts = target.split('/');
  return parts[0] === curCat ? parts[1] : '../' + target;
}

// ---------- 主流程 ----------
(async () => {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'urls.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const index = [];
  let ok = 0, fail = 0;
  for (const it of items) {
    const slug = it.url.replace('https://duan.ayaseeri.com/', '').replace(/\/$/, '');
    const cat = categoryOf(slug);
    const dir = path.join(OUT, cat);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, slug + '.md');
    try {
      const res = await fetch(it.url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const body = extractArticle(html);
      const title = it.name || extractTitle(html);
      if (!body) throw new Error('no article body');
      const md = `# ${title}\n\n> 来源：${it.url}\n\n${blockToMd(body, cat)}\n`;
      fs.writeFileSync(file, md);
      index.push({ pos: it.pos, cat, slug, title });
      ok++;
      process.stdout.write(`\r${ok + fail}/${items.length} ok=${ok} fail=${fail} ${slug}        `);
    } catch (e) {
      fail++;
      console.log(`\nFAIL ${slug}: ${e.message}`);
    }
    await sleep(350);
  }
  fs.writeFileSync(path.join(__dirname, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`\nDONE ok=${ok} fail=${fail}`);
})();
