import { createDevframeClientRuntime } from "@devframes/hub/client";
import { DEVFRAMES_HUB_BASE } from "@devframes/hub/constants";
//#region src/hub-client.ts
/**
* Boot the devframes-hub **client runtime** in the host page: the browser
* half of {@link import('./hub').viteDevframeHub}. Connects RPC to the hub
* (defaulting `base` to `/__devframes/`), assembles the shared
* `DevframeClientContext`, and imports each dock's client script into the
* page. A thin default-applying wrapper over `@devframes/hub/client`'s
* `createDevframeClientRuntime`.
*
* Only needed when you render your own dock UI (or override the hub's `ui`).
* With the default `@devframes/hub-ui`, its injected `embedded.js` boots the
* client for you, so the host page needs no client code.
*/
function mountDevframeHubClient(options = {}) {
	const { base = DEVFRAMES_HUB_BASE, connect, ...rest } = options;
	return createDevframeClientRuntime({
		...rest,
		...rest.rpc ? {} : { connect: {
			baseURL: base,
			...connect
		} }
	});
}
//#endregion
export { mountDevframeHubClient };
