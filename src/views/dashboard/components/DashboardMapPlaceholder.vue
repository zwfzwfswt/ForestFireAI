<template>
  <section class="map-placeholder" aria-labelledby="map-title">
    <header>
      <h2 id="map-title">GIS 综合态势</h2>
      <span>地图预留区</span>
    </header>
    <div class="map-placeholder__canvas">
      <div class="map-placeholder__message">
        <div class="map-placeholder__symbol" aria-hidden="true">◎</div>
        <h3>森林防火监测一张图</h3>
        <p>未来展示林区边界、巡检位置与火情分布</p>
        <span>GIS 地图占位 · 尚未接入 Leaflet</span>
      </div>
    </div>
    <footer>当前无真实地理数据，不展示模拟点位或虚构坐标。</footer>
  </section>
</template>
<style scoped lang="scss">
.map-placeholder {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 460px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid var(--card-border);
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  span,
  footer {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  footer {
    padding: 12px 20px;
  }
  &__canvas {
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 340px;
    padding: 24px;
    background-color: color-mix(in srgb, var(--el-color-success) 5%, var(--el-bg-color-overlay));
    background-image:
      linear-gradient(var(--el-border-color-lighter) 1px, transparent 1px),
      linear-gradient(90deg, var(--el-border-color-lighter) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  &__message {
    max-width: 420px;
    padding: 28px;
    text-align: center;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    p {
      font-size: 14px;
      line-height: 1.8;
      color: var(--el-text-color-secondary);
    }
  }
  &__symbol {
    font-size: 48px;
    color: var(--el-color-success);
  }
}
</style>
