<template>
  <details class="uav-simulator" data-testid="uav-simulator">
    <summary>
      DEV / MOCK SIMULATOR · {{ sourceLabels[simulator.source] }} ·
      {{ connectionLabels[simulator.connection.status] }}
    </summary>
    <label>
      遥测来源
      <select :value="simulator.source" aria-label="遥测数据来源" @change="changeSource">
        <option value="local">LOCAL SIMULATOR</option>
        <option value="websocket">BACKEND WEBSOCKET</option>
      </select>
    </label>
    <p role="status">
      {{ simulator.connection.status }}
      <span v-if="simulator.connection.retryDelay">
        · {{ simulator.connection.retryDelay / 1000 }} 秒后重连
      </span>
      <span v-if="simulator.connection.error">· {{ simulator.connection.error }}</span>
    </p>
    <p>
      仅模拟遥测，无真实设备。默认 {{ simulatorConfig.telemetryInterval }} ms / 次；超过
      {{ simulatorConfig.offlineTimeout / 1000 }} 秒无遥测视为离线；轨迹最多
      {{ simulatorConfig.maxTrackPoints }} 点。
    </p>
    <div v-if="simulator.source === 'local'" class="uav-simulator__actions">
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
    <div v-else class="uav-simulator__actions">
      <button
        :disabled="
          ['connected', 'connecting', 'reconnecting'].includes(simulator.connection.status)
        "
        @click="simulator.start()"
      >
        连接后端
      </button>
      <button :disabled="simulator.connection.status === 'disconnected'" @click="simulator.stop()">
        断开后端
      </button>
      <button @click="simulator.reset()">断开并清除遥测</button>
    </div>
    <ul v-if="simulator.source === 'local'">
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
    <p v-if="simulator.source === 'local'">
      仅模拟演示范围内初始状态为在线、任务或告警的资产（当前
      {{ eligible.length }} 架）。离开地图和资产页面后停止计时；重置保留资产。
    </p>
    <p v-else>
      Python 模拟器独立运行，面板只控制当前浏览器的接收。仅接收已登记 Mock
      UAV；前端新增资产不会创建后端模拟器。离开地图和资产页面会关闭连接与重连计时。
    </p>
  </details>
</template>
<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";
import { useUavSimulatorStore } from "../../../stores/uavSimulator";
import { useUavStore } from "../../../stores/uav";
import { simulatorConfig } from "../simulator/config";
import { connectionLabels, sourceLabels } from "../telemetry/config";
import type { TelemetrySourceKind } from "../telemetry/config";
const simulator = useUavSimulatorStore();
const assets = useUavStore();
const owner = Symbol("simulator-view");
const changeSource = (event: Event) =>
  simulator.setSource((event.target as HTMLSelectElement).value as TelemetrySourceKind);
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
