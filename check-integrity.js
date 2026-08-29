// 在线校验：原站文章数 vs 仓库文件数，逐文件存在性核对
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.text();
}
function diskCount(dir) {
  let n = 0;
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) n += fs.readdirSync(path.join(ROOT, dir, e.name)).filter(f => f.endsWith('.md') && f !== 'README.md').length;
    else if (e.name.endsWith('.md') && e.name !== 'README.md') n++;
  }
  return n;
}

(async () => {
  // ---- duan: sitemap ----
  const sm = await get('https://duan.ayaseeri.com/sitemap.xml');
  const duanUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/^https?:\/\/duan\.ayaseeri\.com\//, '').replace(/\/$/, ''))
    .filter(s => s && s !== 'sitemap.xml');
  console.log('duan: sitemap 文章', duanUrls.length, '| 磁盘', diskCount('duan'));

  // ---- buffett: 首页链接 ----
  const bh = await get('https://buffett.ayaseeri.com/');
  const bSet = new Set();
  const bre = /href="(\/(?:sources|articles|keywords|categories)\/[^"#]+)"/g;
  let m;
  while ((m = bre.exec(bh)) !== null) {
    let p; try { p = decodeURIComponent(m[1].split('#')[0]); } catch (e) { p = m[1].split('#')[0]; }
    bSet.add(p.replace(/\/$/, ''));
  }
  console.log('buffett: 首页链接', bSet.size, '| 磁盘', diskCount('buffett'));
  const bIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'buffett-index.json'), 'utf8'));
  let bMiss = 0;
  for (const it of bIndex) if (!fs.existsSync(path.join(ROOT, 'buffett', it.cat, it.file))) { bMiss++; console.log('  buffett 缺失:', it.cat + '/' + it.file); }
  console.log('buffett: 索引核对缺失', bMiss, '/', bIndex.length);

  // ---- munger: 首页 + thinking-grids 页 ----
  const mh = await get('https://munger.ayaseeri.com/');
  const tg = await get('https://munger.ayaseeri.com/thinking-grids');
  const mSet = new Set();
  const collect = (html, onlyTg) => {
    const re = /href="([^"#]+)"/g;
    let x;
    while ((x = re.exec(html)) !== null) {
      let p; try { p = decodeURIComponent(x[1].split('#')[0]); } catch (e) { p = x[1].split('#')[0]; }
      p = p.replace(/\/$/, '');
      if (!p.startsWith('/')) continue;
      if (onlyTg) { if (/^\/thinking-grids\/.+/.test(p)) mSet.add(p); }
      else {
        const ok = /^\/(sources|articles)\/.+/.test(p) || /^\/(stop-doing|book-list)$/.test(p) || /^\/topics(\/.+)?$/.test(p) || p === '/sources/seeking-wisdom-中文版';
        if (ok) mSet.add(p);
      }
    }
  };
  collect(mh, false); collect(tg, true);
  console.log('munger: 在线文章链接', mSet.size, '| 磁盘', diskCount('munger'));
  const mIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'munger-index.json'), 'utf8'));
  let mMiss = 0;
  for (const it of mIndex) if (!fs.existsSync(path.join(ROOT, 'munger', it.cat, it.file))) { mMiss++; console.log('  munger 缺失:', it.cat + '/' + it.file); }
  console.log('munger: 索引核对缺失', mMiss, '/', mIndex.length);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
