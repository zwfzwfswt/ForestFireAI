import process from "node:process";
import { resolve } from "pathe";
import { Server } from "node:http";
import { DEVFRAMES_HUB_BASE, normalizeHubBase } from "@devframes/hub/constants";
import { initHub } from "@devframes/hub/initiate";
//#region src/hub.ts
let recommendedViteDevtools = false;
function recommendViteDevtools() {
	if (recommendedViteDevtools) return;
	recommendedViteDevtools = true;
	console.warn("[@devframes/vite/hub] Serving a devframes-hub directly inside Vite works, but Vite DevTools (`@vitejs/devtools-kit`) integrates the hub protocol natively, so prefer it for a first-class, multi-integration experience. Pass `{ quiet: true }` to silence this notice.");
}
/**
* Mount a whole **devframes-hub** (many integrations under one namespace,
* one merged RPC registry, one WebSocket) inside an existing Vite dev
* server. One `initHub()` call, mounted as connect middleware; the WebSocket
* shares Vite's own HTTP server (upgrading at `<base>__ws`) unless a `port`
* pins a side-car. The UI defaults to `@devframes/hub-ui` (its `embedded.js`
* bootstrap is injected into the host page automatically); pass `ui` to swap
* it or `ui: false` for a headless hub you drive with `@devframes/hub/client`.
*
* This mounts one integration-agnostic hub. Vite DevTools
* (`@vitejs/devtools-kit`) integrates the same hub protocol natively and is
* the recommended path for a Vite app, so this plugin emits a one-time notice
* to that effect (silence it with `{ quiet: true }`). For dev-serving a
* single devframe's own SPA, reach for `@devframes/vite/single` instead.
*/
function viteDevframeHub(options = {}) {
	const base = normalizeHubBase(options.base ?? DEVFRAMES_HUB_BASE);
	let viteConfig;
	let instance;
	let embeddedSrc;
	let buildUi;
	const teardown = async () => {
		const previous = instance;
		instance = void 0;
		await previous?.close().catch(() => {});
	};
	const resolveUi = async () => options.ui === false ? void 0 : options.ui ?? await loadDefaultUi();
	return {
		name: "devframes:hub",
		/**
		* Dev middleware by default; a production bundle only carries the hub
		* when the host opts into the static build.
		*/
		apply: (_, env) => env.command === "serve" || options.build === true,
		configResolved(config) {
			viteConfig = config;
		},
		async configureServer(server) {
			if (!options.quiet) recommendViteDevtools();
			await teardown();
			const cwd = options.cwd ?? viteConfig?.root ?? process.cwd();
			const ui = await resolveUi();
			const devframes = attachClientScripts(options.devframes, options.clientScripts);
			const httpServer = server.httpServer instanceof Server ? server.httpServer : void 0;
			const hub = initHub({
				base,
				cwd,
				/**
				* Bare-specifier client scripts resolve through Vite's own module
				* graph: `/@id/<specifier>` routes the import (and its transitive
				* bare imports) through Vite's resolution and import-analysis.
				*/
				clientModuleResolution: "/@id/{specifier}",
				origin: options.origin ?? (() => {
					const resolved = server.resolvedUrls?.local?.[0];
					return resolved ? new URL(resolved).origin : "";
				}),
				auth: options.auth,
				/**
				* Share Vite's own HTTP server for the WS upgrade at `<base>__ws`, with no
				* side-car port to discover. A pinned `port` uses a side-car instead;
				* an https/http2 dev server (non-`node:http`) asks for an auto-port
				* side-car. Clients discover either via `__connection.json`.
				*/
				server: httpServer,
				...resolveWsBinding(options.port, httpServer),
				...ui ? { ui } : {},
				devframes,
				...pickDefined(options, [
					"host",
					"renderers",
					"rpcDeclarations",
					"mcp",
					"register",
					"getStorageDir",
					"name",
					"version",
					"configure"
				])
			});
			instance = hub;
			embeddedSrc = ui?.embedded ? `${base}embedded.js` : void 0;
			server.middlewares.use(hub.nodeMiddleware);
			server.httpServer?.once("close", () => {
				if (instance !== hub) return;
				teardown();
			});
		},
		async buildStart() {
			if (viteConfig?.command !== "build" || !options.build) return;
			buildUi = await resolveUi();
			embeddedSrc = buildUi?.embedded ? `${base}embedded.js` : void 0;
		},
		transformIndexHtml() {
			if (!embeddedSrc) return;
			return [{
				tag: "script",
				attrs: {
					type: "module",
					src: embeddedSrc
				},
				injectTo: "body"
			}];
		},
		async closeBundle() {
			await teardown();
			if (viteConfig?.command !== "build" || !options.build) return;
			const cwd = options.cwd ?? viteConfig.root;
			const { buildHub } = await import("@devframes/hub/build");
			await buildHub({
				base,
				cwd,
				outDir: resolve(viteConfig.root, viteConfig.build.outDir, base.slice(1)),
				devframes: attachClientScripts(options.devframes, options.clientScripts) ?? [],
				...buildUi ? { ui: buildUi } : {},
				...pickDefined(options, [
					"renderers",
					"rpcDeclarations",
					"getStorageDir",
					"name",
					"version",
					"configure"
				])
			});
		}
	};
}
/**
* Share Vite's own HTTP server for the WS upgrade unless a `port` pins a
* side-car, or the dev server isn't a plain `node:http` server (https/http2),
* which needs an auto-port side-car.
*/
function resolveWsBinding(port, httpServer) {
	if (port != null) return { ws: { port } };
	return httpServer ? {} : { ws: { sidecar: true } };
}
/** Forward only the options a caller actually set. */
function pickDefined(source, keys) {
	const out = {};
	for (const key of keys) {
		const value = source[key];
		if (value != null) out[key] = value;
	}
	return out;
}
/** Lazy-load `@devframes/hub-ui`'s default UI so it stays an optional dep. */
async function loadDefaultUi() {
	const { createUi } = await import("@devframes/hub-ui");
	return createUi();
}
/** Attach per-id client scripts to their devframe mount entries. */
function attachClientScripts(devframes, clientScripts) {
	if (!devframes || !clientScripts) return devframes;
	return devframes.map((entry) => {
		if (typeof entry === "function" || entry instanceof Promise) return entry;
		const def = entry && typeof entry === "object" && "devframe" in entry ? entry.devframe : entry;
		const clientScript = def ? clientScripts[def.id] : void 0;
		if (!def || !clientScript) return entry;
		return "devframe" in entry ? {
			...entry,
			dock: {
				clientScript,
				...entry.dock
			}
		} : {
			devframe: def,
			dock: { clientScript }
		};
	});
}
//#endregion
export { viteDevframeHub };
