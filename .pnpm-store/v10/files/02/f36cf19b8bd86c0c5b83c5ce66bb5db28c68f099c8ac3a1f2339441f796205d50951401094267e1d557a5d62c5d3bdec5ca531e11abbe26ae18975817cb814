import { UserConfig, UserConfigDefaults } from "@unocss/core";
import { Plugin } from "rollup";
//#region src/types.d.ts
interface RollupPluginConfig<Theme extends object = object> extends UserConfig<Theme> {
  /**
   * Warn when no UnoCSS virtual CSS entry is imported.
   *
   * @default false
   */
  checkImport?: boolean;
}
type UnoCSSRollupPlugin = Plugin;
//#endregion
//#region src/index.d.ts
declare function defineConfig<Theme extends object>(config: RollupPluginConfig<Theme>): RollupPluginConfig<Theme>;
declare function RollupPlugin<Theme extends object>(configOrPath?: RollupPluginConfig<Theme> | string, defaults?: UserConfigDefaults): UnoCSSRollupPlugin;
//#endregion
export { RollupPluginConfig, UnoCSSRollupPlugin, RollupPlugin as default, defineConfig };