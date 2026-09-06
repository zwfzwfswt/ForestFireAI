import { SourceCodeTransformer, UnoGenerator } from "@unocss/core";
import MagicString from "magic-string";
//#region src/index.d.ts
type FilterPattern = Array<string | RegExp> | string | RegExp | null;
type ResolverType = 'oxc' | 'regex';
interface ResolverFilterPattern {
  pattern: string | RegExp;
  resolver: ResolverType;
}
type IncludePattern = Array<string | RegExp | ResolverFilterPattern> | string | RegExp | ResolverFilterPattern | null;
interface TransformerAttributifyJsxOptions {
  /**
   * the list of attributes to ignore
   * @default []
   */
  blocklist?: (string | RegExp)[];
  /**
   * Patterns of modules to be included from processing.
   *
   * Use `{ pattern, resolver }` to select a resolver for matching files.
   * The first matching pattern is used.
   * Patterns without a resolver retain the default Oxc-to-regex fallback.
   *
   * @default [/\.[jt]sx$/, /\.mdx$/]
   */
  include?: IncludePattern;
  /**
   * Regex of modules to exclude from processing
   *
   * @default []
   */
  exclude?: FilterPattern;
}
interface AttributifyResolverParams {
  code: MagicString;
  id: string;
  uno: UnoGenerator<object>;
  isBlocked: (matchedRule: string) => boolean;
}
declare function transformerAttributifyJsx(options?: TransformerAttributifyJsxOptions): SourceCodeTransformer;
//#endregion
export { AttributifyResolverParams, FilterPattern, IncludePattern, ResolverFilterPattern, ResolverType, TransformerAttributifyJsxOptions, transformerAttributifyJsx as default };