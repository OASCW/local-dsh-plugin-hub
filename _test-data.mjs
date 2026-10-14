// 插件中心：纯数据逻辑实测（不涉及 React / DOM —— 只测数据函数）
// 目的：证明 BUNDLED 快照经过 normalize + dedupe 之后【一条都不丢】，且中文覆盖率正常。
// 背景：上一版面板显示「共 0 个插件」，根因是 normalize 的字段链不认快照用的 pkg/en 键。
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const src = readFileSync(file, 'utf8');

// 从 const ZH = { 截到 主题令牌 之前 —— 这一段正好包含 ZH / BUNDLED / zhFor / makeApi / normalize / dedupe
const from = src.indexOf('const ZH = {');
const to = src.indexOf('// ── 主题令牌');
if (from < 0 || to < 0 || to <= from) {
  console.error('  XX 无法定位代码区间（from=' + from + ' to=' + to + '）');
  process.exit(1);
}
const code = src.slice(from, to);

// eslint-disable-next-line no-new-func
const exported = new Function(code + '\n;return { ZH, BUNDLED, zhFor, normalize, dedupe };')();

const rows = exported.dedupe(exported.normalize(exported.BUNDLED, '插件'));

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ★ ' + name + (extra ? '  ' + extra : '')); }
};

console.log('  快照原始条数 (BUNDLED)      = ' + exported.BUNDLED.length);
console.log('  解析后条数 (normalize+dedupe) = ' + rows.length);
check('BUNDLED 非空', exported.BUNDLED.length > 0);
check('解析后条数 = BUNDLED 条数（这就是上次的 bug）', rows.length === exported.BUNDLED.length,
  rows.length === 0 ? '← 说明字段链还是不认 pkg/en' : (rows.length + '/' + exported.BUNDLED.length));

const badPkg = rows.filter((r) => !r.pkg || typeof r.pkg !== 'string');
check('每条都有非空 pkg', badPkg.length === 0, badPkg.length ? JSON.stringify(badPkg) : '');

const withEn = rows.filter((r) => r.en && r.en.length > 10);
check('每条都有英文描述', withEn.length === rows.length, withEn.length + '/' + rows.length);

const withZh = rows.filter((r) => !!exported.zhFor(r.pkg, r.en));
check('中文词典全覆盖', withZh.length === rows.length, withZh.length + '/' + rows.length);

const noVer = rows.filter((r) => !r.version);
check('每条都有版本号', noVer.length === 0, noVer.length ? JSON.stringify(noVer.map((r) => r.pkg)) : '');

console.log('');
console.log('  解析结果预览（前 3 条）：');
rows.slice(0, 3).forEach((r) => {
  console.log('    · ' + r.pkg + '  v' + r.version);
  console.log('      中文: ' + (exported.zhFor(r.pkg, r.en) || '（无）').slice(0, 46) + '…');
});

console.log('');
console.log('  ── 合计：' + pass + ' 通过 / ' + fail + ' 失败 ──');
process.exit(fail === 0 ? 0 : 1);
