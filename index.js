/**
 * 插件中心 —— Host 半边。
 *
 * 第一阶段（当前）：界面完全由 Client 半边负责，Host 这里只登记自身，
 * 保证插件在 profile 里可被正常激活与卸载。
 *
 * 第二阶段（已规划）：在这里做「英文描述 → 中文」的自动翻译。
 *   · 读 profile 的插件清单（package.json 的 bundles / dependencies）
 *   · 对没有中文缓存的描述，用 ctx.llm.stream(...) 调 DSH 自带的 LLM 翻译
 *   · 把结果写进缓存文件，只译一次；以后打开面板直接读缓存
 *   之所以放在 Host：Client（浏览器）里没有 LLM 通道，LLM 只在 Host 侧可用。
 *   之所以不能自定义 remote 把结果送回 Client：DSH 的 ctx.remote 需要
 *   TypeScript + tsdown + Typert 代码生成，普通 JS 插件写不出来。
 *
 * 资源登记遵守官方约定：所有东西在 apply 内用 ctx.effect / ctx.on 注册并返回清理函数。
 */
export const name = 'plugin-hub';

export function apply(ctx, config) {
  // 目前无 Host 侧资源需要登记。保留 apply 使插件成为合法的 Host 入口，
  // 并作为第二阶段翻译逻辑的落点。
  void ctx;
  void config;
}
