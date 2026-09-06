import process from "node:process";
import { initDevframe } from "devframe/initiate";
import { diagnostics, normalizeBasePath, resolveBasePath, resolveClientAssets } from "devframe/internal";
import { resolveStaticAssetsSource } from "devframe/utils/remote-assets";
import { serveStaticNodeMiddleware } from "devframe/utils/serve-static";
import { join, resolve } from "pathe";
//#region src/single.ts
/**
* Statically mount a devframe's built SPA (`def.clientAssets`) at
* `options.base` inside an existing Vite dev server. No RPC server is
* started; reach for {@link devframeViteBridge} when the mounted UI
* needs a live RPC/WebSocket connection back to the devframe.
*
* Use this when the devframe ships its own pre-built UI and the host
* only needs to serve it alongside its own app (e.g. a devtools dock
* whose backend runs elsewhere, or a hub that only wants the static
* assets).
*/
function devframeVitePlugin(d, options = {}) {
	const base = normalizeMountBase(options.base ?? resolveBasePath(d, "hosted"));
	const distDir = resolveClientAssets(d);
	return {
		name: `devframe:${d.id}`,
		apply: "serve",
		configureServer(server) {
			if (!distDir) return;
			const source = resolveStaticAssetsSource(distDir, join(process.cwd(), "node_modules", `.${d.id}`, "devframe"), d.importMetaUrl);
			server.middlewares.use(base, serveStaticNodeMiddleware(typeof source === "string" ? resolve(source) : source));
		}
	};
}
/**
* Bridge a devframe's RPC + WebSocket backend into an existing Vite dev
* server: the host app owns the SPA (`clientAssets` is never mounted), and this
* plugin serves discovery (`<base>__connection.json`), the WebSocket RPC
* upgrade (`<base>__ws`, shared on Vite's own HTTP server), and the
* optional MCP route through {@link initDevframe}'s node middleware, so
* the host-served SPA can discover the endpoint via `connectDevframe`.
*
* The bridge **gates by default** (devframe's interactive OTP unless the
* definition's `cli.auth` opts out), printing its code/link banner to
* stdout, so a bridged devframe isn't silently reachable by anything that
* can open its socket. Pass `options.auth: false` to opt out for a
* single-user localhost host, or a {@link DevframeAuthHandler} for a
* custom scheme.
*
* Use this when integrating with frameworks that own the SPA (Nuxt, Astro,
* SolidStart, plain Vite apps). Reach for {@link devframeVitePlugin} instead
* when the devframe just needs to serve its own pre-built UI with no live
* backend, or `createCac` (`devframe/adapters/cac`) for the all-in-one
* `dev` / `build` / `mcp` shell.
*/
function devframeViteBridge(d, options = {}) {
	const base = normalizeMountBase(options.base ?? resolveBasePath(d, "hosted"));
	let instance;
	return {
		name: `devframe:${d.id}`,
		apply: "serve",
		async configureServer(server) {
			await instance?.close().catch(() => {});
			instance = void 0;
			try {
				const created = initDevframe(d, {
					base,
					/**
					* The host app owns the SPA in bridge mode, so never mount the
					* definition's own client assets here.
					*/
					distDir: false,
					flags: options.flags,
					host: options.host,
					...options.port != null ? { ws: { port: options.port } } : server.httpServer ? { server: server.httpServer } : { ws: { sidecar: true } },
					/**
					* Gate by default: an unset `auth` defers to the handler
					* (devframe's interactive OTP unless `cli.auth` opts out) rather
					* than leaving the socket ungated. `false` opts out explicitly.
					*/
					auth: options.auth,
					mcp: options.mcp,
					allowedOrigins: options.allowedOrigins
				});
				server.middlewares.use(created.nodeMiddleware);
				await created.ready;
				instance = created;
			} catch (e) {
				diagnostics.DF0033({
					id: d.id,
					reason: String(e),
					cause: e
				}, { method: "warn" });
				return;
			}
			server.httpServer?.once("close", () => {
				instance?.close().catch(() => {});
			});
		},
		async closeBundle() {
			await instance?.close().catch(() => {});
			instance = void 0;
		}
	};
}
/**
* Convenience wrapper around {@link devframeVitePlugin} /
* {@link devframeViteBridge}, picked via `options.bridge`. Reach for the
* two underlying plugins directly when a devframe needs both mounted at
* once (e.g. a bridge for RPC alongside a static mount serving its own
* bundled UI).
*/
function devframeVite(d, options = {}) {
	const { bridge, ...rest } = options;
	return bridge ? devframeViteBridge(d, rest) : devframeVitePlugin(d, { base: rest.base });
}
/**
* Make `base` safe for `server.middlewares.use(path, …)`. Vite's connect
* router matches by absolute URL prefix, so relative spellings like
* `'./'` (commonly used for base-agnostic Nuxt builds) collapse to the
* origin root before the shared leading/trailing-slash normalization.
*/
function normalizeMountBase(base) {
	return normalizeBasePath(base.replace(/^\.\/?/, "/"));
}
//#endregion
export { devframeVite, devframeViteBridge, devframeVitePlugin };
