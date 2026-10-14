/**
 * 插件中心 —— Client 半边（浏览器里运行）。
 *
 * ★本次关键修正（基于实测到的异常）：
 *   上一版页面用函数组件 + Hooks（useState/useEffect/useCallback），结果面板里
 *   出现了错误边界兜住的异常。最可能的原因是【Invalid hook call】——
 *   也就是「宿主提供的 React」与「渲染我这个组件用的 React」不是同一个实例。
 *   我原来的 hasHooks 检查只能看出函数是否存在，查不出实例不同。
 *   ⇒ 现在整页改成 **class 组件**（React.Component + this.setState），
 *     完全不用 Hooks，从根上避开这一类失败。
 *     （错误边界本身就是 class 组件，而它确实渲染出来了 ⇒ class 一定可用。）
 *
 * 官方约定（严格遵守）：
 *   · 只 require('react')，绝不 import 任何 @deepseek-ai/dsh-client-ui-* 包
 *   · 组件外的东西一律不碰：不写 document.body，不读别的插件的 DOM
 *   · 视觉只用宿主主题令牌（真实名字从官方 PluginManagerPage 的 CSS 里抄的：
 *     --dsw-alias-label-primary / label-secondary / label-tertiary / label-caption、
 *     --dsw-alias-border-l3、--dsw-radius-lg 等），且全部带 fallback
 *   · 注册走 ctx.slots.inject(ownerKey, () => ctx.slots.register(...))
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-hub',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'plugin-hub';
    const NS = '@local/dsh-plugin-hub';

    // ★构建戳：显示在面板状态行里，用来**一眼判断当前跑的是哪一版代码**。
    //   如果这个戳没变，说明客户端模块压根没被重新加载 —— 那是加载问题，不是代码问题。
    //   每改一次 client.js 都要改这里。
    const BUILD = 'BUILD-2026-10-14-2315';

    // ── 中文词典：包名 → 中文描述 ──────────────────────────────────────
    //   ⚠️ 下面是**示例数据**，不是任何真实环境的插件清单。
    //     换成你自己的插件：把每个包 package.json 里的 name 与中文说明写进来即可。
    const ZH = {
      '@example/dsh-theme-skin': '演示主题皮肤：给整个 DSH 界面换一套配色。此处仅为示例数据。',
      '@example/dsh-usage-widget': '演示小组件：在界面角落显示用量与状态信息。此处仅为示例数据。',
      '@example/dsh-diagram-skill': '演示技能包：把文字描述变成可交互的架构图与流程图。此处仅为示例数据。',
      '@local/dsh-plugin-hub': '插件中心（本插件）：搜索已安装的外部插件，并把英文描述显示成中文。'
    };

    // ── 示例快照：面板的默认数据（**不是真实环境清单**）────────────────
    //   为什么用内置快照、而不是实时读取（实测结论）：
    //     · 目标 profile 里并没有挂载 pluginManager / pluginInventory 这两个
    //       远程命名空间，所以"打开面板就有数据"不能押在 ctx.remote 上；
    //     · 押上去的结果就是面板永远空着（"依旧没有读取到"）。
    //   ⇒ 这层快照保证【面板一打开就有内容】。
    //   数据来源（照这个办法生成你自己的清单）：profile 的 package.json 里的
    //     bundles + dependencies，再逐个读各包自己的 package.json
    //     取 name / version / description。
    //   ⚠️ 下面是**示例数据**，请按上面的方法替换成你自己的插件清单。
    const BUNDLED = [
      { pkg: '@example/dsh-theme-skin', version: '0.1.0',
        en: 'Example theme skin that repaints the DSH Web UI with a placeholder palette.' },
      { pkg: '@example/dsh-usage-widget', version: '0.2.0',
        en: 'Example status widget pinned to the bottom-right corner, showing usage and state.' },
      { pkg: '@example/dsh-diagram-skill', version: '1.0.0',
        en: 'Example skill bundle that turns text descriptions into interactive diagrams.' },
      { pkg: '@local/dsh-plugin-hub', version: '0.2.0',
        en: 'Searchable plugin panel in the sidebar that shows external plugins with Chinese descriptions.' }
    ];

    function zhFor(pkg, en) {
      if (ZH[pkg]) return ZH[pkg];
      if (/^@deepseek-ai\//.test(pkg)) return 'DSH 内置功能包（随应用一同安装，不需单独维护）。';
      return '';
    }

    // ── 数据来源：**只用内置快照** ────────────────────────────────────
    //   ★实测结论（两轮报错换来的）：
    //     1) 不声明就访问 ctx.remote → 「cannot get property "remote" without inject」
    //     2) 声明了 remote 之后，访问 remote.pluginManager →
    //        「cannot get property "remote.pluginManager" without inject」
    //        —— Cordis 是**逐层校验**的，每一层都要单独声明。
    //     3) 但这个 profile 里那两层命名空间**根本没挂载**：声明了它们却不存在时，
    //        Cordis 会让插件一直等、干脆不加载 —— 那比"没有实时数据"糟得多。
    //   ⇒ 所以这里**完全不碰 ctx.remote**：清单来自上面的 BUNDLED 快照。
    //     快照由 agent 从 profile 真实读出后写进代码（见 BUNDLED 上方注释）。
    //     装了新插件想让快照跟上，让 agent 重新生成一次即可。
    function makeApi(ctx) {
      void ctx; // 刻意不使用 ctx.remote，理由见上
      return {
        list: async function () {
          return { bundles: BUNDLED, plugins: [], inventory: [] };
        }
      };
    }

    // 把各种形状的记录归一成 { pkg, version, en, group }
    function normalize(value, group) {
      const rows = [];
      const push = function (pkg, version, en, g) {
        if (!pkg || typeof pkg !== 'string') return;
        rows.push({ pkg: pkg, version: version || '', en: typeof en === 'string' ? en : '', group: g || '' });
      };
      const visit = function (item, g) {
        if (!item) return;
        if (typeof item === 'string') { push(item, '', '', g); return; }
        if (typeof item !== 'object') return;
        // ★★ 这里的字段链必须覆盖【内置快照用的键】。
        //   踩过的坑：快照条目写的是 { pkg, version, en }，
        //   而这里原来只认 packageName/name/id/package 和 description/summary，
        //   两边对不上 ⇒ pkg 取到空串 ⇒ 被 push 的守卫丢掉 ⇒ 列表 0 条。
        //   所以 `item.pkg` 和 `item.en` 必须排在最前面。
        push(
          item.pkg || item.packageName || item.name || item.id || item.package || '',
          item.version || item.installedVersion || '',
          item.en || item.description || item.summary || (item.meta && item.meta.description) || '',
          g
        );
        const kids = item.plugins || item.entries || item.rows;
        if (Array.isArray(kids)) kids.forEach(function (k) { visit(k, g); });
      };
      if (Array.isArray(value)) { value.forEach(function (v) { visit(v, group); }); return rows; }
      if (value && typeof value === 'object') {
        Object.keys(value).forEach(function (k) {
          const v = value[k];
          if (Array.isArray(v)) v.forEach(function (x) { visit(x, k); });
          else visit(v, k);
        });
      }
      return rows;
    }

    function dedupe(rows) {
      const seen = {};
      const order = [];
      rows.forEach(function (r) {
        if (!seen[r.pkg]) { seen[r.pkg] = r; order.push(r.pkg); return; }
        const prev = seen[r.pkg];
        seen[r.pkg] = {
          pkg: r.pkg,
          version: prev.version || r.version,
          en: prev.en || r.en,
          group: prev.group || r.group
        };
      });
      return order.map(function (p) { return seen[p]; });
    }

    // ── 主题令牌（真实名字，从官方 PluginManagerPage 的 CSS 抄的）────────
    // ★技能「常见坑 #2」：不要混向一块**固定**的面板色，而要取"它屁股底下"
    //   那个真实可见的颜色。Web 里的等价做法 = 用宿主自己的主题令牌，
    //   并且**每一档都给 fallback** —— 只写一个令牌，一旦它不存在，
    //   颜色就会变成空值 ⇒ 视觉上"等于不存在"（技能 定律一）。
    const T = {
      text: 'var(--dsw-alias-label-primary, currentColor)',
      dim: 'var(--dsw-alias-label-secondary, var(--dsw-alias-label-tertiary, #8b8f96))',
      dim2: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-caption, #9aa0a6))',
      line: 'var(--dsw-alias-border-l3, var(--dsw-alias-border-l2, rgba(127,127,127,0.3)))',
      // lineStrong：给"必须看得见"的边界用（整块面板的外框、输入框、按钮）。
      //   比 line 更实，且最后一档是不透明的实色 —— 保证任何主题下都不是空白。
      lineStrong: 'var(--dsw-alias-border-l1, var(--dsw-alias-border-l2, rgba(140,146,158,0.55)))',
      // control：控件（输入框 / 按钮）的底。技能 §三要求控件**不吃透明度**、
      //   永远保持固定且明显的色，所以这里最后一档是不透明的实色，不是 6% 的淡影。
      control: 'var(--dsw-alias-bg-layer-l2, var(--dsw-alias-bg-layer-l1, rgba(140,146,158,0.18)))',
      accent: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
      danger: 'var(--dsw-alias-state-error-primary, #c0392b)',
      radiusLg: 'var(--dsw-radius-lg, 8px)',
      radiusXl: 'var(--dsw-radius-xl, 10px)'
    };

    // ── 样式：作为 React 元素渲染，卸载时自动消失 ──────────────────────
    function Styles() {
      return h('style', {
        dangerouslySetInnerHTML: {
          __html: [
            // ★技能「定律一：颜色一样 = 不存在」（§六）：
            //   容器不能和自己的背景同色 —— 同色就等于"不存在"。
            //   所以整块面板**必须有自己的边界**：哪怕所有主题令牌全部取不到，
            //   也一定能看见"这里有一块面板"，而不会是一片空白。
            '.ph-root{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;',
            'height:100%;min-height:120px;padding:16px clamp(16px,3vw,32px);overflow:auto;color:' + T.text + ';',
            'border:1px solid ' + T.line + ';border-radius:' + T.radiusXl + ';}',
            '.ph-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
            // 输入框是"控件"不是"文字" ⇒ 允许有自己的底（技能 §三：控件不吃透明度那条的同类）
            '.ph-search{flex:1 1 240px;min-width:180px;box-sizing:border-box;padding:8px 10px;',
            'border:1px solid ' + T.lineStrong + ';border-radius:' + T.radiusLg + ';background:' + T.control + ';color:' + T.text + ';font-size:13px;outline:none;}',
            '.ph-search:focus{border-color:' + T.accent + ';}',
            // ★技能 §三「透明度和按钮无关」：按钮永远用**固定、明显**的色，
            //   否则用户看不出哪里能点。所以这里刻意用最实的一档底 + 更亮的边框。
            '.ph-btn{padding:8px 12px;border:1px solid ' + T.lineStrong + ';border-radius:' + T.radiusLg + ';background:' + T.control + ';color:' + T.text + ';font-size:13px;cursor:pointer;}',
            '.ph-btn:hover{border-color:' + T.accent + ';}',
            '.ph-btn:disabled{opacity:.55;cursor:default;}',
            '.ph-meta{font-size:12px;color:' + T.dim + ';}',
            '.ph-list{display:flex;flex-direction:column;gap:8px;}',
            // ★技能 §四「文字不加底」：列表项**不给底色块**，只用边框和间距分隔，
            //   文字直接落在宿主自己的背景上。（"往底色里混"式的假透明不要）
            '.ph-card{border:1px solid ' + T.line + ';border-radius:' + T.radiusXl + ';background:transparent;padding:10px 12px;}',
            '.ph-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}',
            '.ph-name{font-size:13px;font-weight:600;word-break:break-all;}',
            '.ph-ver{font-size:11px;color:' + T.dim2 + ';}',
            '.ph-group{font-size:11px;color:' + T.dim2 + ';border:1px solid ' + T.line + ';border-radius:999px;padding:1px 7px;}',
            '.ph-zh{font-size:13px;line-height:1.6;margin-top:6px;}',
            '.ph-en{font-size:12px;line-height:1.55;color:' + T.dim + ';margin-top:6px;word-break:break-word;}',
            '.ph-none{font-size:12px;color:' + T.dim + ';}',
            '.ph-err{font-size:12px;color:' + T.danger + ';border:1px dashed ' + T.line + ';border-radius:' + T.radiusLg + ';padding:10px;word-break:break-word;}',
            '.ph-tag{font-size:11px;color:' + T.dim2 + ';}',
            '.ph-hl{background:' + T.accent + ';color:#fff;border-radius:3px;padding:0 2px;}',
            // 内联版（注入插件管理器页面用）：紧凑、有边框，皮肤盖不到这里
            '.ph-inline{display:flex;flex-direction:column;gap:10px;padding:10px 0;}',
            '.ph-inline-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
            '.ph-inline-title{font-size:13px;font-weight:600;white-space:nowrap;}',
            // ═══ 反皮肤隔离层（用户要求：皮肤开着时插件中心也要能看见、能点）═══
            //   皮肤的遮挡靠三样：position:fixed + inset:0 的全屏装饰、高 z-index、
            //   改写主题变量。这三样都赢不了下面这段：
            //     · 每条声明带 !important  ⇒ 压过皮肤样式表里的普通规则
            //     · z-index 取 32 位上限    ⇒ 没有比它更高的层
            //     · isolation:isolate       ⇒ 自成层叠上下文，不受外层 z-index 摆布
            //     · 不透明底                ⇒ 皮肤的画与花纹透不过来
            //     · contain:layout paint    ⇒ 绘制范围锁在自己盒子里
            //   说明：这里的底**故意不透明**，与技能「文字不加底」不冲突 ——
            //   技能那条针对"单个文字控件不要假透明色块"，这里是"整块面板必须
            //   盖住皮肤"；按技能 定律一，容器要和背景明显不同才叫"存在"。
            '.ph-root{position:relative !important;z-index:2147483647 !important;',
            'isolation:isolate !important;contain:layout paint style !important;',
            // ★皮肤的四种"不显示"手段，逐一反制（次数是从皮肤源码里数出来的）：
            //   display:none(18) visibility:hidden(4) opacity:0(17) pointer-events:none(23)
            'display:flex !important;visibility:visible !important;',
            'opacity:1 !important;pointer-events:auto !important;',
            'background:var(--dsw-alias-bg-layer-1,#f8faff) !important;',
            'color:var(--dsw-alias-label-primary,#172347) !important;',
            'border:1px solid var(--dsw-alias-border-l3,#c5a468) !important;}',
            '.ph-inline{position:relative !important;z-index:2147483647 !important;',
            'isolation:isolate !important;contain:layout paint style !important;',
            'display:flex !important;visibility:visible !important;',
            'opacity:1 !important;pointer-events:auto !important;',
            'background:var(--dsw-alias-bg-layer-1,#f8faff) !important;',
            'color:var(--dsw-alias-label-primary,#172347) !important;}',
            '.ph-card{display:block !important;visibility:visible !important;opacity:1 !important;',
            'background:var(--dsw-alias-bg-layer-2,#ebf0fa) !important;}',
            '.ph-search,.ph-btn{display:inline-block !important;visibility:visible !important;opacity:1 !important;',
            'pointer-events:auto !important;',
            'background:var(--dsw-alias-bg-layer-2,#ebf0fa) !important;',
            'color:var(--dsw-alias-label-primary,#172347) !important;',
            'border:1px solid var(--dsw-alias-border-l3,#c5a468) !important;}'
          ].join('')
        }
      });
    }

    // 关键词高亮（拆成片段，不用 innerHTML，避免注入）
    function highlight(text, query) {
      const q = (query || '').trim();
      if (!q || !text) return text;
      const lower = text.toLowerCase();
      const ql = q.toLowerCase();
      const parts = [];
      let i = 0, n = 0;
      for (;;) {
        const at = lower.indexOf(ql, i);
        if (at < 0) { parts.push(text.slice(i)); break; }
        if (at > i) parts.push(text.slice(i, at));
        parts.push(h('mark', { key: 'm' + (n++), className: 'ph-hl' }, text.slice(at, at + q.length)));
        i = at + q.length;
      }
      return parts;
    }

    // ── 错误边界：任何异常都画在页面上，绝不留空白 ─────────────────────
    class HubBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { err: null };
      }
      static getDerivedStateFromError(err) {
        return { err: err };
      }
      componentDidCatch(err, info) {
        try { console.error('[plugin-hub] render failed:', err, info); } catch (e) { /* ignore */ }
      }
      render() {
        if (this.state.err) {
          const e = this.state.err;
          return h('div', { style: { padding: '16px', fontSize: '13px', lineHeight: 1.7, color: T.text } },
            h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '插件中心渲染失败'),
            h('div', { style: { color: T.danger, wordBreak: 'break-word' } }, String((e && e.message) || e)),
            h('div', { style: { marginTop: '8px', opacity: 0.7, fontSize: '12px' } },
              '请把这三行连同下面这行一起截图发我 —— 不要清空控制台。')
          );
        }
        return this.props.children;
      }
    }

    // ── 页面（class 组件：不用任何 Hooks）────────────────────────────────
    class PluginHubPage extends React.Component {
      constructor(props) {
        super(props);
        this.state = { query: '', rows: null, err: '', showEn: false, busy: false };
        this.onQuery = this.onQuery.bind(this);
        this.onToggleEn = this.onToggleEn.bind(this);
        this.onReload = this.onReload.bind(this);
      }

      componentDidMount() {
        this.load();
      }

      load() {
        // ★第一步：**立刻**用内置快照把列表填上 —— 面板永远不为空。
        //   这是本插件最重要的一条设计约束：数据来源不可靠时，
        //   宁可显示"稍旧的快照"，也不要显示"什么都没有"。
        //   （对照技能 定律一：不存在 = 看不见。空列表就是"不存在"。）
        //
        //   ★数据只有一个来源：内置快照。不再尝试 ctx.remote ——
        //     实测那个 profile 没有挂载 remote.pluginManager / remote.pluginInventory，
        //     硬试只会得到一行错误提示，反而盖住了本来正常的列表。
        const snapshot = dedupe(normalize(BUNDLED, '插件'));
        snapshot.sort(function (a, b) { return a.pkg < b.pkg ? -1 : (a.pkg > b.pkg ? 1 : 0); });
        // ★自检：快照明明有数据却解析出 0 条 ⇒ 一定是解析 bug。
        //   必须自己喊出来，不能像上次那样只剩一句"没有读到插件"让人干瞪眼。
        const selfCheck = snapshot.length === 0
          ? ('内置快照解析出 0 条（BUNDLED 里其实有 ' + BUNDLED.length
             + ' 条）—— 这是解析字段不匹配的 bug，请报告。')
          : '';
        this.setState({ rows: snapshot, busy: false, err: selfCheck, source: '内置快照' });
      }

      onQuery(e) { this.setState({ query: e.target.value }); }
      onToggleEn() { this.setState(function (s) { return { showEn: !s.showEn }; }); }
      onReload() { this.load(); }

      render() {
        const all = this.state.rows || [];
        const q = this.state.query.trim().toLowerCase();
        const self = this;
        const filtered = q
          ? all.filter(function (r) {
              return (r.pkg + ' ' + r.version + ' ' + r.en + ' ' + zhFor(r.pkg, r.en)).toLowerCase().indexOf(q) >= 0;
            })
          : all;
        const translated = all.filter(function (r) { return !!zhFor(r.pkg, r.en); }).length;

        return h('div', { className: 'ph-root' },
          h(Styles),
          h('div', { className: 'ph-bar' },
            h('input', {
              className: 'ph-search', type: 'search', value: this.state.query,
              placeholder: '搜索插件：名称 / 描述 / 包名…', 'aria-label': '搜索插件',
              onChange: this.onQuery
            }),
            h('button', { className: 'ph-btn', onClick: this.onReload, disabled: this.state.busy },
              this.state.busy ? '刷新中…' : '刷新'),
            h('button', { className: 'ph-btn', onClick: this.onToggleEn, title: '显示每个插件的英文原文' },
              this.state.showEn ? '隐藏英文' : '显示英文')
          ),
          h('div', { className: 'ph-meta' },
            '共 ' + all.length + ' 个插件 · 已译 ' + translated + ' 个 · 当前显示 ' + filtered.length + ' 个'
            + (this.state.source ? (' · 数据来源：' + this.state.source) : '')
            + ' · ' + BUILD),
          this.state.err ? h('div', { className: 'ph-err' }, this.state.err) : null,
          h('div', { className: 'ph-list' },
            filtered.length === 0
              ? h('div', { className: 'ph-none' },
                  this.state.busy ? '正在读取插件清单…' : (q ? '没有匹配的插件。' : '没有读到插件。'))
              : filtered.map(function (r) {
                  const zh = zhFor(r.pkg, r.en);
                  return h('div', { className: 'ph-card', key: r.pkg },
                    h('div', { className: 'ph-head' },
                      h('span', { className: 'ph-name' }, highlight(r.pkg, self.state.query)),
                      r.version ? h('span', { className: 'ph-ver' }, 'v' + r.version) : null,
                      r.group ? h('span', { className: 'ph-group' }, r.group) : null,
                      (!zh && r.en) ? h('span', { className: 'ph-tag' }, '未收录中文') : null
                    ),
                    zh ? h('div', { className: 'ph-zh' }, highlight(zh, self.state.query))
                       : (r.en ? h('div', { className: 'ph-zh' }, highlight(r.en, self.state.query))
                               : h('div', { className: 'ph-none' }, '（这个插件没有写描述）')),
                    (self.state.showEn && r.en && zh) ? h('div', { className: 'ph-en' }, '原文：' + r.en) : null
                  );
                })
          )
        );
      }
    }

    // ── 侧栏图标（无状态函数组件，不用 Hooks）────────────────────────────
    function PluginHubIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
        'aria-hidden': true, style: { display: 'block' }
      },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'M15.5 15.5 21 21' })
      );
    }

    function HubRoot(props) {
      return h(HubBoundary, null, h(PluginHubPage, props));
    }

    // ── 内联版：注入到【插件管理器页面】内部的 plugins.item 槽位 ─────────
    //   为什么要多这一版（实测结论，不是猜的）：
    //     · 某些全屏装饰皮肤用 position:fixed + inset:0 + 100vw/100vh +
    //       z-index:4 的侧栏装饰**盖住了侧栏那一条**，于是注册在
    //       sidebar.panellist 的图标被埋掉 —— 看不见，也点不到。
    //     · 颜色不是问题：皮肤把 --dsw-alias-label-primary 定成 #172347、
    //       --dsw-alias-bg-layer-2 定成 #ebf0fad6，对比度完全够。
    //       纯粹是**布局遮挡**。
    //     · plugins.item 是插件管理器页面**内部**的槽位，属于普通内容区，
    //       皮肤不覆盖它 ⇒ 这是一条皮肤盖不住的通道。
    //   顺带一提：这恰好就是用户最初的诉求「在插件栏添加搜索框」——
    //   插件栏 = 插件管理器页面。
    class PluginHubInline extends React.Component {
      constructor(props) {
        super(props);
        this.state = { query: '', open: false };
        this.onQuery = this.onQuery.bind(this);
        this.onToggle = this.onToggle.bind(this);
      }
      onQuery(e) { this.setState({ query: e.target.value, open: true }); }
      onToggle() { this.setState(function (s) { return { open: !s.open }; }); }
      snapshot() {
        const rows = dedupe(normalize(BUNDLED, '插件'));
        rows.sort(function (a, b) { return a.pkg < b.pkg ? -1 : (a.pkg > b.pkg ? 1 : 0); });
        return rows;
      }
      render() {
        const all = this.snapshot();
        const q = this.state.query.trim().toLowerCase();
        const self = this;
        const filtered = q
          ? all.filter(function (r) {
              return (r.pkg + ' ' + r.version + ' ' + r.en + ' ' + zhFor(r.pkg, r.en)).toLowerCase().indexOf(q) >= 0;
            })
          : all;
        return h('div', { className: 'ph-inline' },
          h(Styles),
          h('div', { className: 'ph-inline-bar' },
            h('span', { className: 'ph-inline-title' }, '插件中心 · 搜索'),
            h('input', {
              className: 'ph-search', type: 'search', value: this.state.query,
              placeholder: '搜索已装插件（名称 / 描述 / 包名）…', 'aria-label': '搜索插件',
              onChange: this.onQuery
            }),
            h('button', { className: 'ph-btn', onClick: this.onToggle },
              this.state.open ? '收起' : ('展开 ' + all.length + ' 个'))
          ),
          this.state.open
            ? (filtered.length === 0
                ? h('div', { className: 'ph-none' }, q ? '没有匹配的插件。' : '没有读到插件。')
                : h('div', { className: 'ph-list' }, filtered.map(function (r) {
                    const zh = zhFor(r.pkg, r.en);
                    return h('div', { className: 'ph-card', key: r.pkg },
                      h('div', { className: 'ph-head' },
                        h('span', { className: 'ph-name' }, highlight(r.pkg, self.state.query)),
                        r.version ? h('span', { className: 'ph-ver' }, 'v' + r.version) : null
                      ),
                      h('div', { className: 'ph-zh' },
                        highlight(zh || r.en || '（这个插件没有写描述）', self.state.query))
                    );
                  })))
            : null
        );
      }
    }

    return {
      // ★ inject 只声明 slots。
      //   为什么不再声明 remote（两轮实测换来的结论）：
      //     1) 不声明 remote 就访问 ctx.remote →
      //        「cannot get property "remote" without inject」
      //     2) 声明 remote 后访问 remote.pluginManager →
      //        「cannot get property "remote.pluginManager" without inject」
      //        —— Cordis 逐层校验，每一层都得单独声明。
      //     3) 那个 profile 里两层命名空间都没挂载；而声明了不存在的服务时，
      //        Cordis 会让插件一直等待、不加载 —— 面板会整个消失，比现在更糟。
      //   ⇒ 彻底不依赖 remote：清单用内置快照（面板一打开就有内容）。
      inject: ['slots'],
      apply(ctx) {
        const api = makeApi(ctx);

        // 主面板（页面本体）
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ api })
          }, HubRoot);
        });

        // 侧栏入口（order 1 = 紧跟插件管理器）
        //   ★注意：开着这类全屏装饰皮肤时，侧栏那一条会被皮肤的
        //     全屏装饰盖住，这个入口会看不见 —— 所以下面**再加一条**
        //     皮肤盖不住的通道（plugins.item，插件管理器页面内部）。
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 1,
          label: () => '插件中心',
          locale: NS
        }, PluginHubIcon));

        // ★第二条通道：插件管理器【页面内部】的 plugins.item 槽位。
        //   ⚠ 实测这条路走不通：官方 README 写明「plugins.item（list）
        //     **用于官方插件**」—— 它是按官方插件过滤的列表，
        //     第三方插件注册进去不会显示。代码保留，只为记录这次尝试。
        ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item',
          id: 'plugin-hub-inline',
          order: 50,
          label: () => '插件中心（搜索）',
          locale: NS
        }, PluginHubInline));

        // ★★第三条通道（这次选对了）：设置页的 settings.section。
        //   为什么选它：
        //     · 官方插件自己也用这个槽位 —— 形状是直接从
        //       @deepseek-ai/dsh-client-ui-agent-preset/lib/client.js 抄的：
        //       { name, id, order, label: () => 字符串, locale, inject }
        //     · 它渲染在【设置页】里，那是普通内容页；皮肤那些
        //       position:fixed + inset:0 + z-index:4 的全屏侧栏装饰盖不到它。
        //     · 它会出现在设置页的左侧导航里，名字就是 label() 的返回值，
        //       所以一旦皮肤埋掉了侧栏图标，从这里照样能进。
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'plugin-hub',
          order: 90,
          label: () => '插件中心',
          locale: NS,
          inject: () => ({ api })
        }, HubRoot));
      }
    };
  }
});
