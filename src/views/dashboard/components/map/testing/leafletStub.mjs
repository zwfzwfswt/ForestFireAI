// 可观测 Leaflet 替身：模拟组的递归挂载/移除及多监听器事件，不发起瓦片请求。
export function createLeafletStub() {
  const maps = [];
  class Layer {
    constructor(kind, coordinates, options) {
      Object.assign(this, { kind, coordinates, options });
    }
    addTo(parent) {
      parent.addLayer(this);
      return this;
    }
    setLatLngs(value) {
      this.coordinates = value;
      return this;
    }
    setLatLng(value) {
      this.coordinates = value;
      return this;
    }
    setContent(value) {
      this.content = value;
      return this;
    }
    on() {
      return this;
    }
    off() {
      return this;
    }
  }
  class Group extends Layer {
    constructor() {
      super("group");
      this.children = new Set();
    }
    addLayer(layer) {
      this.children.add(layer);
      this.map?.addLayer(layer);
      return this;
    }
    removeLayer(layer) {
      this.children.delete(layer);
      this.map?.removeLayer(layer);
      return this;
    }
    clearLayers() {
      [...this.children].forEach((layer) => this.removeLayer(layer));
      return this;
    }
    getLayers() {
      return [...this.children];
    }
  }
  const L = {
    layerGroup: () => new Group(),
    circleMarker: (p, o) => new Layer("point", p, o),
    marker: (p, o) => new Layer("marker", p, o),
    divIcon: (options) => options,
    geoJSON(data, options) {
      const group = new Group();
      for (const feature of data.features ?? []) {
        const geometry = feature.geometry;
        const layer =
          geometry.type === "Point"
            ? options.pointToLayer(feature, {
                lat: geometry.coordinates[1],
                lng: geometry.coordinates[0],
              })
            : new Layer(
                geometry.type === "Polygon" ? "polygon" : "polyline",
                geometry.coordinates,
                options.style(feature)
              );
        group.addLayer(layer);
      }
      return group;
    },
    polyline: (p, o) => new Layer("polyline", p, o),
    polygon: (p, o) => new Layer("polygon", p, o),
    tooltip: (o) => new Layer("tooltip", undefined, o),
    tileLayer: (url) => new Layer("tile", url),
    DomEvent: { stop() {} },
    control: { zoom: () => ({ addTo() {} }), scale: () => ({ addTo() {} }) },
    map(container, options = { center: [30, 119], zoom: 9 }) {
      let doubleClickEnabled = true;
      const events = new Map();
      const layers = new Set();
      const panes = new Map();
      const map = {
        events,
        layers,
        panes,
        getPane: (name) => panes.get(name),
        createPane(name) {
          const pane = {
            style: {},
            remove() {
              this.removed = true;
            },
          };
          panes.set(name, pane);
          return pane;
        },
        removed: false,
        center: options.center,
        zoom: options.zoom,
        doubleClickZoom: {
          enabled: () => doubleClickEnabled,
          enable() {
            doubleClickEnabled = true;
          },
          disable() {
            doubleClickEnabled = false;
          },
        },
        on(names, fn) {
          for (const name of names.split(" ")) {
            if (!events.has(name)) events.set(name, new Set());
            events.get(name).add(fn);
          }
          return this;
        },
        off(names, fn) {
          if (!names) events.clear();
          else
            for (const name of names.split(" ")) {
              if (fn) events.get(name)?.delete(fn);
              else events.delete(name);
              if (!events.get(name)?.size) events.delete(name);
            }
          return this;
        },
        fire(name, event) {
          [...(events.get(name) ?? [])].forEach((fn) => fn(event));
        },
        addLayer(layer) {
          if (layers.has(layer)) return this;
          layers.add(layer);
          if (layer instanceof Group) {
            layer.map = this;
            layer.children.forEach((child) => this.addLayer(child));
          }
          return this;
        },
        removeLayer(layer) {
          if (!layers.delete(layer)) return this;
          if (layer instanceof Group) {
            layer.children.forEach((child) => this.removeLayer(child));
            layer.map = undefined;
          }
          return this;
        },
        hasLayer: (layer) => layers.has(layer),
        getContainer: () => container,
        getCenter() {
          return { lat: this.center[0], lng: this.center[1] };
        },
        getZoom() {
          return this.zoom;
        },
        setView(center, zoom) {
          this.center = center;
          this.zoom = zoom;
          return this;
        },
        invalidateSize() {},
        remove() {
          this.removed = true;
          [...layers].forEach((layer) => this.removeLayer(layer));
        },
      };
      maps.push(map);
      return map;
    },
  };
  return { L, maps };
}

export function createContainer() {
  const keys = new Map();
  return {
    keys,
    style: { cursor: "grab" },
    focus() {},
    addEventListener: (name, fn) => keys.set(name, fn),
    removeEventListener: (name) => keys.delete(name),
  };
}
