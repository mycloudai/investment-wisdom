// 生成 GitHub Pages 静态站（docsify）：分类目录 README + _sidebar.md + index.html + _coverpage.md + .nojekyll
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const numOf = f => parseInt(path.basename(f).split('-')[0], 10) || 0;

// 站点定义：目录名、展示名、分类（目录/中文名）
const SITES = [
  {
    dir: 'duan', name: '段永平', index: 'index.json',
    fileOf: it => `${it.num}-${it.slug}.md`,
    cats: [
      ['zhuti', '主题'], ['wenda', '问答'], ['yanjiang-fangtan', '演讲访谈'], ['renwu-gongsi', '人物公司'],
    ],
  },
  {
    dir: 'buffett', name: '巴菲特', index: 'buffett-index.json',
    fileOf: it => it.file,
    cats: [
      ['letters', '致股东信'], ['partner-letters', '致合伙人信'], ['meetings', '股东大会'], ['interviews', '访谈与演讲'],
      ['articles/company', '主题解读·公司'], ['articles/industry', '主题解读·行业'], ['articles/person', '主题解读·人物'],
      ['articles/question', '主题解读·问答'], ['articles/timeline', '主题解读·时间线'], ['articles/category-overview', '主题解读·分类总览'],
      ['keywords', '关键词索引'], ['categories', '分类总览'],
    ],
  },
  {
    dir: 'munger', name: '芒格', index: 'munger-index.json',
    fileOf: it => it.file,
    cats: [
      ['letters', '致股东信'], ['meetings', '股东会讲话'], ['speeches', '演讲与访谈'], ['li-lu', '李录（芒格传承）'],
      ['articles', '主题解读'], ['thinking-grids', '思维格栅'], ['topics', '主题专题'], ['guides', '指南与书单'],
    ],
  },
];

let sidebar = '- [首页](/)\n';
let total = 0;

for (const site of SITES) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, site.index), 'utf8'));
  sidebar += `- **${site.name}**\n`;
  for (const [cat, cname] of site.cats) {
    const items = index
      .filter(it => it.cat === cat)
      .map(it => ({ ...it, file: site.fileOf(it) }))
      .filter(it => fs.existsSync(path.join(ROOT, site.dir, cat, it.file)))
      .sort((a, b) => numOf(a.file) - numOf(b.file));
    total += items.length;
    // 分类目录 README.md（docsify 目录首页 + GitHub 浏览索引用）
    let md = `# ${site.name} · ${cname}（共 ${items.length} 篇）\n\n`;
    for (const it of items) md += `- [${it.title}](./${encodeURI(it.file)})\n`;
    fs.writeFileSync(path.join(ROOT, site.dir, cat, 'README.md'), md);
    sidebar += `  - [${cname}](/${site.dir}/${cat}/)\n`;
  }
}

fs.writeFileSync(path.join(ROOT, '_sidebar.md'), sidebar);

fs.writeFileSync(path.join(ROOT, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投资智慧知识库</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@4/lib/themes/vue.css">
</head>
<body>
<div id="app">加载中…</div>
<script>
window.$docsify = {
  name: '投资智慧知识库',
  loadSidebar: true,
  subMaxLevel: 3,
  auto2top: true,
  coverpage: true,
  pagination: { previousText: '上一篇', nextText: '下一篇', crossChapter: true },
  search: {
    depth: 3,
    noData: { '/': '没有找到相关结果' },
    placeholder: { '/': '搜索全文…' },
    hideOtherSidebarContent: false
  }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/docsify@4"></script>
<script src="https://cdn.jsdelivr.net/npm/docsify/lib/plugins/search.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/docsify-pagination/dist/docsify-pagination.min.js"></script>
</body>
</html>
`);

fs.writeFileSync(path.join(ROOT, '_coverpage.md'), `# 投资智慧知识库

> 段永平 · 巴菲特 · 芒格
>
> ${total} 篇离线全文，全文搜索，在线阅读

- [开始阅读](/README.md)
- [段永平](/duan/zhuti/)
- [巴菲特](/buffett/letters/)
- [芒格](/munger/thinking-grids/)

![logo](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3C/svg%3E)

[GitHub](https://github.com/mycloudai/investment-wisdom)
`);

fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');
console.log('docsify 站点生成完成，文章总数', total);
