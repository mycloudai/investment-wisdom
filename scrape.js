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
function inlineToMd(html) {
  let s = html;
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, t, c) => '**' + c.replace(/<[^>]+>/g, '').trim() + '**');
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, t, c) => '*' + c.replace(/<[^>]+>/g, '').trim() + '*');
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = text.replace(/<[^>]+>/g, '').trim();
    if (!t) return '';
    return `[${t}](${href})`;
  });
  return s.replace(/<[^>]+>/g, '');
}
function blockToMd(html) {
  let s = html;
  // 去掉评论区与脚本样式
  s = s.replace(/<section class="article-comments"[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  let out = [];
  // 按块级标签切
  const blockRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>|<li\b[^>]*>([\s\S]*?)<\/li>|<hr\s*\/?>/gi;
  let m, last = 0, inList = false;
  const push = t => { if (t.trim()) out.push(t.trim()); };
  while ((m = blockRe.exec(s)) !== null) {
    const before = s.slice(last, m.index).replace(/<[^>]+>/g, '').trim();
    if (before) push(decodeEntities(before)), inList = false;
    if (m[1]) { // heading
      const level = '#'.repeat(+m[1][1]);
      push(`${level} ${decodeEntities(inlineToMd(m[2])).trim()}`);
      inList = false;
    } else if (m[3] !== undefined) { // p
      push(decodeEntities(inlineToMd(m[3])).replace(/\s+/g, ' ').trim());
      inList = false;
    } else if (m[4] !== undefined) { // blockquote
      const inner = decodeEntities(inlineToMd(m[4])).replace(/\s+/g, ' ').trim();
      push(inner.split('\n').map(l => '> ' + l).join('\n'));
      inList = false;
    } else if (m[5] !== undefined) { // li
      push('- ' + decodeEntities(inlineToMd(m[5])).replace(/\s+/g, ' ').trim());
      inList = true;
    } else { // hr
      push('---'); inList = false;
    }
    last = blockRe.lastIndex;
  }
  const tail = s.slice(last).replace(/<[^>]+>/g, '').trim();
  if (tail) push(decodeEntities(tail));
  // 合并空行
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
      const md = `# ${title}\n\n> 来源：${it.url}\n\n${blockToMd(body)}\n`;
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
