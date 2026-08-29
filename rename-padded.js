// 序号补零重命名（max(2, 位数) 位），同步替换站点内所有 md 链接与 index json
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

(async () => {
  for (const site of ['buffett-ayaseeri', 'munger-ayaseeri']) {
    const siteDir = path.join(ROOT, site);
    // 1) 按目录收集编号文件，计算新名
    const byDir = new Map(); // dirAbs -> [{old, num, base}]
    for (const f of walk(siteDir)) {
      if (!f.endsWith('.md')) continue;
      const m = path.basename(f).match(/^(\d+)-(.+\.md)$/);
      if (!m) continue;
      const d = path.dirname(f);
      if (!byDir.has(d)) byDir.set(d, []);
      byDir.get(d).push({ old: m[0], num: parseInt(m[1], 10), base: m[2] });
    }
    const renames = new Map(); // siteRelPath(old) -> newBasename
    for (const [d, items] of byDir) {
      const maxN = Math.max(...items.map(i => i.num));
      const width = Math.max(2, String(maxN).length);
      for (const it of items) {
        const nn = String(it.num).padStart(width, '0');
        if (nn === it.old.split('-')[0]) continue; // 已达标
        const rel = path.relative(siteDir, path.join(d, it.old)).split(path.sep).join('/');
        renames.set(rel, nn + '-' + it.base);
      }
    }
    if (!renames.size) { console.log(site + ': 无需重命名'); continue; }
    // 2) 执行文件重命名
    for (const [rel, newName] of renames) {
      fs.renameSync(path.join(siteDir, rel), path.join(path.dirname(path.join(siteDir, rel)), newName));
    }
    // 3) 替换所有 md 内链接（仅换 basename）
    for (const f of walk(siteDir)) {
      if (!f.endsWith('.md')) continue;
      let md = fs.readFileSync(f, 'utf8');
      const base = path.relative(siteDir, path.dirname(f)).split(path.sep).join('/');
      md = md.replace(/\]\(([^)\s]+)(#[^)\s]*)?\)/g, (full, p, anchor) => {
        if (/^https?:/i.test(p)) return full;
        let dp = safeDecode(p);
        const dirPart = dp.includes('/') ? dp.slice(0, dp.lastIndexOf('/') + 1) : '';
        const name = dp.slice(dirPart.length);
        if (!renames.has(path.posix.normalize(path.posix.join(base === '.' ? '' : base, dirPart + name)))) return full;
        return `](${dirPart}${renames.get(path.posix.normalize(path.posix.join(base === '.' ? '' : base, dirPart + name)))}${anchor || ''})`;
      });
      fs.writeFileSync(f, md);
    }
    // 4) 更新 index json
    for (const jf of [path.join(ROOT, site.replace('-ayaseeri', '') + '-index.json')]) {
      if (!fs.existsSync(jf)) continue;
      const arr = JSON.parse(fs.readFileSync(jf, 'utf8'));
      for (const it of arr) {
        const rel = (it.cat ? it.cat + '/' : '') + it.file;
        if (renames.has(rel)) it.file = renames.get(rel);
      }
      fs.writeFileSync(jf, JSON.stringify(arr, null, 1));
    }
    console.log(site + ': 重命名 ' + renames.size + ' 个文件并更新链接');
  }
})();
