<template>
  <details class="uav-simulator" data-testid="uav-simulator">
    <summary>DEV / MOCK SIMULATOR · {{ modeLabels[simulator.state.mode] }}</summary>
    <p>
      仅本地模拟遥测，无真实设备。{{ simulatorConfig.telemetryInterval }} ms / 次；超过
      {{ simulatorConfig.offlineTimeout / 1000 }} 秒无遥测视为离线；轨迹最多
      {{ simulatorConfig.maxTrackPoints }} 点。
    </p>
    <div class="uav-simulator__actions">
      <button :disabled="simulator.state.mode !== 'stopped'" @click="simulator.start()">
        启动全部模拟器
      </button>
      <button :disabled="simulator.state.mode !== 'running'" @click="simulator.pause()">
        暂停全部
      </button>
      <button :disabled="simulator.state.mode === 'stopped'" @click="simulator.resume()">
        恢复全部
      </button>
      <button @click="simulator.reset()">重置模拟遥测</button>
    </div>
    <ul>
      <li v-for="uav in eligible" :key="uav.id">
        <span>
          {{ uav.name }} ·
          {{
            simulator.state.pausedIds.includes(uav.id) ? "已暂停" : modeLabels[simulator.state.mode]
          }}
        </span>
        <button :disabled="simulator.state.mode !== 'running'" @click="toggle(uav.id)">
          {{ simulator.state.pausedIds.includes(uav.id) ? "恢复" : "暂停" }}
        </button>
      </li>
    </ul>
    <p>
      仅模拟演示范围内初始状态为在线、任务或告警的资产（当前
      {{ eligible.length }} 架）。离开地图和资产页面后停止计时；重置保留资产。
    </p>
  </details>
</template>
<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";
import { useUavSimulatorStore } from "../../../stores/uavSimulator";
import { useUavStore } from "../../../stores/uav";
import { simulatorConfig } from "../simulator/config";
const simulator = useUavSimulatorStore();
const assets = useUavStore();
const owner = Symbol("simulator-view");
const modeLabels = { stopped: "未启动", running: "模拟中", paused: "全部暂停" };
const eligible = computed(() =>
  assets.list.filter((uav) => simulator.state.eligibleIds.includes(uav.id))
);
const toggle = (id: string) =>
  simulator.state.pausedIds.includes(id) ? simulator.resume(id) : simulator.pause(id);
onMounted(() => simulator.acquire(owner));
onActivated(() => simulator.acquire(owner));
onDeactivated(() => simulator.release(owner));
onBeforeUnmount(() => simulator.release(owner));
</script>
<style scoped lang="scss">
.uav-simulator {
  padding: 10px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;

  summary {
    font-weight: 600;
    cursor: pointer;
  }
  p {
    margin: 8px 0;
    font-size: 12px;
  }
  ul {
    display: grid;
    gap: 6px;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  button {
    padding: 4px 10px;
    color: inherit;
    cursor: pointer;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    border-radius: 4px;
  }
  button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
