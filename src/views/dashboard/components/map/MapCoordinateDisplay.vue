<template>
  <footer class="map-coordinates">
    <span>经度：{{ coordinate ? coordinate.lng.toFixed(6) : "—" }}</span>
    <span>纬度：{{ coordinate ? coordinate.lat.toFixed(6) : "—" }}</span>
    <span>Zoom：{{ zoom }}</span>
    <span>WGS84 · 鼠标位置</span>
  </footer>
</template>
<script setup lang="ts">
defineProps<{ coordinate: { lat: number; lng: number } | null; zoom: number }>();
</script>
<style scoped>
.map-coordinates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 16px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
