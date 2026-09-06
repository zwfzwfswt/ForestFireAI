// 独立管理异步初始化竞态：停用/卸载后不执行迟到的地图工厂。
export function createMapSession<T>(load: () => Promise<() => T>, dispose: (value: T) => void) {
  let generation = 0;
  let pending = false;
  let current: T | undefined;
  return {
    async start() {
      if (pending || current) return;
      pending = true;
      const token = ++generation;
      try {
        const create = await load();
        if (token === generation) current = create();
      } finally {
        if (token === generation) pending = false;
      }
    },
    stop() {
      generation++;
      pending = false;
      if (current) dispose(current);
      current = undefined;
    },
  };
}
