import { t as DEVFRAME_EVENTS } from "./events-BV4Dj59a.mjs";
import { t as diagnostics } from "./diagnostics-DZA6KQ_Z.mjs";
//#region src/utils/events.ts
/**
* Create event emitter.
*/
function createEventEmitter() {
	const _listeners = {};
	function emit(event, ...args) {
		const callbacks = _listeners[event] || [];
		for (let i = 0, length = callbacks.length; i < length; i++) {
			const callback = callbacks[i];
			if (callback) callback(...args);
		}
	}
	function emitOnce(event, ...args) {
		emit(event, ...args);
		delete _listeners[event];
	}
	function on(event, cb) {
		(_listeners[event] ||= []).push(cb);
		return () => {
			_listeners[event] = _listeners[event]?.filter((i) => cb !== i);
		};
	}
	function once(event, cb) {
		const unsubscribe = on(event, ((...args) => {
			unsubscribe();
			return cb(...args);
		}));
		return unsubscribe;
	}
	return {
		_listeners,
		emit,
		emitOnce,
		on,
		once
	};
}
//#endregion
//#region src/node/agent-args.ts
/**
* Map the args payload an agent surface receives (MCP sends an object
* keyed `arg0`/`arg1`/…, matching the schema the adapter advertises) onto
* a handler's positional parameters. Shared by the agent host's RPC
* bridge and the hub's command-derived tools so the coercion cannot
* drift between them.
*
* - an array passes through as-is
* - `null`/`undefined` become a zero-argument call
* - with declared schemas, each schema reads its own `argN` key, in order
* - without schemas, `arg0`/`arg1`/… keys are collected when present
* - an empty object becomes a zero-argument call
* - anything else follows the {@link AgentArgsFallback}
*/
function coerceAgentPositionalArgs(args, schemas, fallback = "wrap") {
	if (Array.isArray(args)) return args;
	if (args === void 0 || args === null) return [];
	if (typeof args === "object") {
		const obj = args;
		if (schemas && schemas.length) return schemas.map((_, i) => obj[`arg${i}`]);
		if ("arg0" in obj) {
			const out = [];
			let i = 0;
			while (`arg${i}` in obj) {
				out.push(obj[`arg${i}`]);
				i++;
			}
			return out;
		}
		if (Object.keys(obj).length === 0) return [];
	}
	return fallback === "drop" ? [] : [args];
}
//#endregion
//#region src/node/host-agent.ts
/**
* Framework-neutral host aggregating the agent-exposed surface of a
* devframe. Auto-discovers RPC functions with an `agent` field from
* `ctx.rpc.definitions`, and accepts plugin-registered tools /
* resources via `registerTool` / `registerResource`.
*/
var DevframeAgentHost = class {
	context;
	events = createEventEmitter();
	tools = /* @__PURE__ */ new Map();
	resources = /* @__PURE__ */ new Map();
	providers = /* @__PURE__ */ new Set();
	_rpcUnsubscribe;
	constructor(context) {
		this.context = context;
		this._rpcUnsubscribe = context.rpc.onChanged(() => {
			this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		});
	}
	registerTool(input) {
		this._validateToolId(input.id);
		const tool = this._projectTool(input);
		this.tools.set(tool.id, {
			tool,
			handler: input.handler
		});
		this.events.emit(DEVFRAME_EVENTS.bus.agentToolRegistered, tool);
		this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		return { unregister: () => this.unregisterTool(tool.id) };
	}
	unregisterTool(id) {
		const existed = this.tools.delete(id);
		if (existed) {
			this.events.emit(DEVFRAME_EVENTS.bus.agentToolUnregistered, id);
			this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		}
		return existed;
	}
	registerToolProvider(provider) {
		this.providers.add(provider);
		this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		const notifyChanged = () => {
			if (this.providers.has(provider)) this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		};
		return {
			notifyChanged,
			unregister: () => {
				if (this.providers.delete(provider)) this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
			}
		};
	}
	registerResource(input) {
		if (this.resources.has(input.id)) throw diagnostics.DF0016({ id: input.id });
		const resource = {
			id: input.id,
			name: input.name,
			description: input.description,
			mimeType: input.mimeType ?? "application/json",
			uri: input.uri ?? `devframe://resource/${encodeURIComponent(input.id)}`
		};
		this.resources.set(resource.id, {
			resource,
			read: input.read
		});
		this.events.emit(DEVFRAME_EVENTS.bus.agentResourceRegistered, resource);
		this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		return { unregister: () => this.unregisterResource(resource.id) };
	}
	unregisterResource(id) {
		const existed = this.resources.delete(id);
		if (existed) {
			this.events.emit(DEVFRAME_EVENTS.bus.agentResourceUnregistered, id);
			this.events.emit(DEVFRAME_EVENTS.bus.agentManifestChanged);
		}
		return existed;
	}
	list() {
		const rpcTools = this._collectRpcTools();
		const plainTools = Array.from(this.tools.values()).map((t) => t.tool);
		const resources = Array.from(this.resources.values()).map((r) => r.resource);
		const seen = new Set([...rpcTools, ...plainTools].map((t) => t.id));
		const providerTools = [];
		for (const { tool } of this._collectProviderTools()) {
			if (seen.has(tool.id)) continue;
			seen.add(tool.id);
			providerTools.push(tool);
		}
		return {
			tools: [
				...rpcTools,
				...plainTools,
				...providerTools
			],
			resources
		};
	}
	hasSurface() {
		if (this.tools.size > 0 || this.resources.size > 0) return true;
		for (const [, def] of this.context.rpc.definitions) if (def.agent) return true;
		for (const provider of this.providers) if (provider().length > 0) return true;
		return false;
	}
	getTool(id) {
		const plain = this.tools.get(id);
		if (plain) return plain.tool;
		const rpc = this._collectRpcTools().find((t) => t.id === id);
		if (rpc) return rpc;
		return this._collectProviderTools().find((t) => t.tool.id === id)?.tool;
	}
	getResource(id) {
		return this.resources.get(id)?.resource;
	}
	async invoke(id, args) {
		const plain = this.tools.get(id);
		if (plain?.handler) return await plain.handler(args);
		const rpcDef = this._findRpcDefinition(id);
		if (rpcDef) {
			const positional = coerceAgentPositionalArgs(args, rpcDef.args, "wrap");
			return await this.context.rpc.invokeLocal(id, ...positional);
		}
		const provided = this._collectProviderTools().find((t) => t.tool.id === id);
		if (provided) return await provided.input.handler(args);
		throw new Error(`[devframe/agent] tool "${id}" not found`);
	}
	async read(id) {
		const entry = this.resources.get(id);
		if (!entry) throw new Error(`[devframe/agent] resource "${id}" not found`);
		return await entry.read();
	}
	/** @internal */
	_dispose() {
		this._rpcUnsubscribe?.();
		this._rpcUnsubscribe = void 0;
	}
	_validateToolId(id) {
		if (this.tools.has(id)) throw diagnostics.DF0015({ id });
		if (this.context.rpc.definitions.get(id)?.agent) throw diagnostics.DF0015({ id });
	}
	_projectTool(input) {
		if (!input.description || typeof input.description !== "string") throw diagnostics.DF0014({ name: input.id });
		return {
			id: input.id,
			kind: "tool",
			title: input.title ?? input.id,
			description: input.description,
			safety: input.safety ?? "action",
			tags: input.tags,
			/**
			* Standard Schema `args` are carried raw (mirroring how an RPC-backed
			* tool defers to `ctx.rpc.definitions`); consumers (the MCP adapter)
			* convert to JSON Schema on demand. An explicit `inputSchema` override
			* wins when given.
			*/
			args: input.args,
			inputSchema: input.inputSchema,
			outputSchema: input.outputSchema,
			examples: input.examples
		};
	}
	/** Query every registered provider, projecting inputs to serializable tools. */
	_collectProviderTools() {
		const out = [];
		for (const provider of this.providers) for (const input of provider()) out.push({
			input,
			tool: this._projectTool(input)
		});
		return out;
	}
	_collectRpcTools() {
		const out = [];
		for (const [name, def] of this.context.rpc.definitions) {
			const agent = def.agent;
			if (!agent) continue;
			if (!agent.description || typeof agent.description !== "string") throw diagnostics.DF0014({ name });
			const type = def.type ?? "query";
			const safety = agent.safety ?? inferSafety(type);
			out.push({
				id: name,
				kind: "rpc",
				title: agent.title ?? name,
				description: agent.description,
				safety,
				tags: agent.tags,
				rpcName: name,
				examples: agent.examples
			});
		}
		return out;
	}
	_findRpcDefinition(id) {
		const def = this.context.rpc.definitions.get(id);
		if (def?.agent) return def;
	}
};
function inferSafety(type) {
	if (type === "static" || type === "query") return "read";
	return "action";
}
//#endregion
export { coerceAgentPositionalArgs as n, createEventEmitter as r, DevframeAgentHost as t };
