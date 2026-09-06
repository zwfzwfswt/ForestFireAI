import "./constants.mjs";
import { r as importServicePackage } from "./services-install-Ben4yh52.mjs";
import { n as getPort } from "./dist-CZXfGEkd.mjs";
import { cleanDoubleSlashes, withLeadingSlash, withTrailingSlash, withoutLeadingSlash } from "ufo";
//#region src/node/import-runtime-module.ts
/**
* Resolve and import a package at runtime without adding it to a consumer's
* bundle graph. First-party adapters use this for modules whose code is
* needed only when the matching feature is enabled (optional peers, and the
* MCP adapter with the SDK behind it).
*
* @internal
*/
async function importRuntimeModule(specifier) {
	return await importServicePackage(specifier, [import.meta.url]);
}
//#endregion
//#region src/adapters/_shared.ts
const DEFAULT_PORT = 9999;
/**
* Resolve the mount base path for a devframe's SPA. Hosted adapters
* (`vite`, `embedded`) default to `/__<id>/` so they don't collide
* with the host app; standalone adapters (`cli`, `build`)
* default to `/` because they own the origin.
*
* The devframe author can override with `basePath` on the definition.
*/
function resolveBasePath(def, kind) {
	if (def.basePath) return normalizeBasePath(def.basePath);
	return kind === "standalone" ? "/" : `/__${def.id}/`;
}
function normalizeBasePath(base) {
	return cleanDoubleSlashes(withTrailingSlash(withLeadingSlash(base)));
}
/**
* Resolve the listening port for `createDevServer` (and `createHandler`'s
* side-car tiers), honoring the definition's `cli.port` / `cli.portRange` /
* `cli.random` settings. Exposed separately so authors who run their own
* argv parsing can resolve a port up-front (to print it, log it, etc.)
* before starting the server.
*/
async function resolveDevServerPort(def, options = {}) {
	const host = options.host ?? def.cli?.host ?? "localhost";
	const portOptions = {
		port: options.defaultPort ?? def.cli?.port ?? DEFAULT_PORT,
		host
	};
	if (def.cli?.portRange) portOptions.portRange = def.cli.portRange;
	if (def.cli?.random) portOptions.random = def.cli.random;
	return getPort(portOptions);
}
/**
* Normalize an *explicit* `mcp` setting into a fully-resolved config, or
* `undefined` when the MCP route is disabled. `'auto'` also resolves to
* `undefined` here: whether it mounts depends on the live agent surface,
* which only the mounting adapter can consult (through
* {@link loadAutoMcpAdapter}) - static resolvers like
* `resolveMcpConnectionMeta` treat it as unadvertisable.
*
* An enabled route trusts same-machine callers by default: the authorization
* resolves to origin-only (`false`) unless the object config opts into a
* bearer/callback identity check. An empty-string bearer is treated as no
* bearer (origin-only) rather than a usable credential.
*/
function resolveMcpConfig(mcp) {
	if (!mcp || mcp === "auto") return void 0;
	if (mcp === true) return { authorization: false };
	const authorization = typeof mcp.authorization === "string" && mcp.authorization.length === 0 ? false : mcp.authorization ?? false;
	return {
		...mcp.path !== void 0 ? { path: mcp.path } : {},
		...mcp.allowedOrigins !== void 0 ? { allowedOrigins: mcp.allowedOrigins } : {},
		authorization
	};
}
/**
* Resolve the `mcp: 'auto'` default at mount time: import the MCP adapter
* when the devframe's agent surface is non-empty, or return `undefined`
* (mount nothing) when the surface is empty - the zero-cost path, loading
* no MCP code at all. The adapter (and the MCP SDK behind it) loads through
* `importRuntimeModule`, so it never enters a consumer's bundle graph.
*
* Generic like `importRuntimeModule`: the caller names the module type
* (`typeof import('devframe/adapters/mcp')`) so this shared helper carries
* no type-level dependency on the MCP adapter.
*/
async function loadAutoMcpAdapter(agent) {
	if (!agent.hasSurface()) return void 0;
	return await importRuntimeModule("devframe/adapters/mcp");
}
/**
* Resolve the `mcp` entry a `__connection.json` should advertise for a dev
* server started with the given `mcp` option (falling back to `def.cli?.mcp`,
* exactly like `createDevServer`), or `undefined` when the route is
* disabled. `'auto'` (the omitted default) resolves at mount time against
* the live agent surface, so hand-rolled meta advertises it only for an
* explicit setting; the adapters advertise the actually-mounted route
* themselves.
*
* Hosted bridges that hand-roll their connection meta pass the side-car
* `port`: the advertised path becomes absolute (the side-car mounts at `/`)
* and the client dials `<page-host>:<port><path>`. Without `port` the path
* stays relative, resolved against `__connection.json`'s own location (the
* same-server default).
*/
function resolveMcpConnectionMeta(def, mcp, port) {
	const config = resolveMcpConfig(mcp ?? def.cli?.mcp);
	if (!config) return void 0;
	const route = withoutLeadingSlash(config.path ?? "__mcp");
	return port != null ? {
		path: withLeadingSlash(route),
		port
	} : { path: route };
}
//#endregion
export { resolveMcpConfig as a, resolveDevServerPort as i, normalizeBasePath as n, resolveMcpConnectionMeta as o, resolveBasePath as r, importRuntimeModule as s, loadAutoMcpAdapter as t };
