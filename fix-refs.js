// 后处理：1) 删除 URL 形式来源行  2) 图片下载本地化  3) 残余原站链接降级纯文字
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITES = [
  { dir: 'duan', host: 'duan.ayaseeri.com' },
  { dir: 'buffett', host: 'buffett.ayaseeri.com' },
  { dir: 'munger', host: 'munger.ayaseeri.com' },
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

async function dl(url, dest, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) {
      if (i === tries - 1) { console.error('IMG-FAIL', url, e.message); return false; }
      await sleep(800);
    }
  }
}

(async () => {
  let totalImgs = 0, failImgs = 0, totalSrc = 0, totalDemote = 0;
  for (const site of SITES) {
    const siteDir = path.join(ROOT, site.dir);
    const imgDir = path.join(siteDir, 'images');
    const files = walk(siteDir);
    const used = new Set();
    for (const f of files) {
      let md = fs.readFileSync(f, 'utf8');
      // 1) 删除「来源：https://...」行（含引用块前缀，正文「来源：《书名》」保留）
      const n = (md.match(/^>?\s*来源：\s*https?:\/\/\S+\s*$/gm) || []).length;
      md = md.replace(/^>?\s*来源：\s*https?:\/\/\S+\s*\n?/gm, '');
      totalSrc += n;
      // 2) 图片本地化
      const re = /(!\[[^\]]*\]\()(https?:\/\/[^/]*ayaseeri\.com\/[^)\s]+)(\))/gi;
      for (const m of [...md.matchAll(re)]) {
        const url = m[2];
        let base;
        try { base = decodeURIComponent(url.split('/').pop().split('?')[0]); } catch (e) { base = url.split('/').pop(); }
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(base)) base += '.png';
        let name = base, i = 1;
        while (used.has(name)) name = base.replace(/(\.[a-z]+)$/i, `-${i++}$1`);
        used.add(name);
        fs.mkdirSync(imgDir, { recursive: true });
        if (await dl(url, path.join(imgDir, name))) {
          const depth = path.relative(siteDir, f).split(path.sep).length - 1;
          const relPath = depth === 0 ? `images/${name}` : `${'../'.repeat(depth)}images/${name}`;
          md = md.replace(m[0], m[1] + relPath + m[3]);
          totalImgs++;
        } else failImgs++;
        await sleep(250);
      }
      // 3) 残余原站超链接降级为纯文字
      const d = (md.match(/\[([^\]]*)\]\(https?:\/\/(duan|buffett|munger)\.ayaseeri\.com[^)]*\)/g) || []).length;
      md = md.replace(/\[([^\]]*)\]\(https?:\/\/(duan|buffett|munger)\.ayaseeri\.com[^)]*\)/g, '$1');
      totalDemote += d;
      fs.writeFileSync(f, md);
    }
  }
  console.log(`来源行删除=${totalSrc} 图片成功=${totalImgs} 失败=${failImgs} 链接降级=${totalDemote}`);
})();
