// 生成 buffett/munger 子站 README 分组索引 + 根 README 总览（不含原站链接）
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const BUFFETT_CATS = [
  ['letters', '致股东信'],
  ['partner-letters', '致合伙人信'],
  ['meetings', '股东大会'],
  ['interviews', '访谈与演讲'],
  ['articles/company', '主题解读 · 公司'],
  ['articles/industry', '主题解读 · 行业'],
  ['articles/person', '主题解读 · 人物'],
  ['articles/question', '主题解读 · 问答'],
  ['articles/timeline', '主题解读 · 时间线'],
  ['articles/category-overview', '主题解读 · 分类总览'],
  ['keywords', '关键词索引'],
  ['categories', '分类总览'],
];
const MUNGER_CATS = [
  ['letters', '致股东信'],
  ['meetings', '股东会讲话'],
  ['speeches', '演讲与访谈'],
  ['li-lu', '李录（芒格传承）'],
  ['articles', '主题解读'],
  ['thinking-grids', '思维格栅'],
  ['topics', '主题专题'],
  ['guides', '指南与书单'],
];
const numOf = f => parseInt(f.split('-')[0], 10) || 0;

function siteReadme(site, cats, indexFile, title, intro) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, indexFile), 'utf8'));
  let md = `# ${title}\n\n${intro}\n\n`;
  let total = 0;
  for (const [cat, name] of cats) {
    const items = index.filter(i => i.cat === cat).sort((a, b) => numOf(a.file) - numOf(b.file));
    total += items.length;
    md += `## ${name}（${items.length}）\n\n`;
    for (const it of items) md += `- [${it.title}](./${cat}/${encodeURI(it.file)})\n`;
    md += '\n';
  }
  md = md.replace('${TOTAL}', String(total));
  fs.writeFileSync(path.join(ROOT, site, 'README.md'), md.replace('## ', '## ').replace('（共 ${TOTAL} 篇）', `（共 ${total} 篇）`));
  return total;
}

// 先渲染标题行里的总数：重写一遍，简单可靠
function siteReadme2(site, cats, indexFile, title, intro) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, indexFile), 'utf8'));
  const groups = cats.map(([cat, name]) => {
    const items = index.filter(i => i.cat === cat).sort((a, b) => numOf(a.file) - numOf(b.file));
    return { cat, name, items };
  });
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  let md = `# ${title}（共 ${total} 篇）\n\n${intro}\n\n`;
  md += `- [${'目录总览'}](#目录)\n\n<!-- generated -->\n`;
  md = `# ${title}（共 ${total} 篇）\n\n${intro}\n\n## 目录\n\n`;
  for (const g of groups) md += `- ${g.name}（${g.items.length}）\n`;
  md += '\n';
  for (const g of groups) {
    md += `## ${g.name}（${g.items.length}）\n\n`;
    for (const it of g.items) md += `- [${it.title}](./${g.cat}/${encodeURI(it.file)})\n`;
    md += '\n';
  }
  fs.writeFileSync(path.join(ROOT, site, 'README.md'), md);
  return total;
}

const bt = siteReadme2('buffett', BUFFETT_CATS, 'buffett-index.json',
  '巴菲特知识库', '镜像自 buffett 站（伯克希尔·哈撒韦股东信、合伙人信、股东大会、访谈与主题解读）。目录结构与网站一致，文件名序号为站内阅读顺序。');
const mg = siteReadme2('munger', MUNGER_CATS, 'munger-index.json',
  '芒格知识库', '镜像自 munger 站（芒格演讲、股东会、致股东信、思维格栅与主题解读）。目录结构与网站一致，文件名序号为站内阅读顺序。');

// 根 README
let root = `# investment-wisdom\n\n投资大师内容离线知识库。目录结构与各来源网站一致，文章文件名带序号前缀（站内阅读顺序），正文内站内链接均转换为仓库内相对路径，图片已本地化，无外部原站引用。\n\n## 来源总览\n\n| 目录 | 内容 | 篇数 |\n|---|---|---|\n`;
root += `| duan/ | 段永平：问答、主题、演讲访谈、人物公司 | 154 |\n`;
root += `| buffett/ | 巴菲特：股东信、合伙人信、股东大会、访谈、主题解读、关键词、分类 | ${bt} |\n`;
root += `| munger/ | 芒格：演讲、股东会、致股东信、李录、主题解读、思维格栅、专题 | ${mg} |\n`;
root += `| **合计** | | **${154 + bt + mg}** |\n\n`;
root += `## 目录结构\n\n- **duan/**：zhuti（主题）/ wenda（问答）/ yanjiang-fangtan（演讲访谈）/ renwu-gongsi（人物公司）\n- **buffett/**：letters / partner-letters / meetings / interviews / articles/{company,industry,person,question,timeline,category-overview} / keywords / categories\n- **munger/**：letters / meetings / speeches / li-lu / articles / thinking-grids / topics / guides\n\n各来源子目录详见其 README.md 索引。\n`;
fs.writeFileSync(path.join(ROOT, 'README.md'), root);
console.log(`buffett=${bt} munger=${mg} 总计=${154 + bt + mg}`);
