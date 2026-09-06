import { emptyPayload, uavStatuses } from "./config";
import type { Uav, UavInput, UavQuery } from "./types";

export function uavInput(uav?: Uav): UavInput {
  return {
    name: uav?.name ?? "",
    serialNumber: uav?.serialNumber ?? "",
    model: uav?.model ?? "",
    organization: uav?.organization ?? "",
    status: uav?.status ?? "offline",
    longitude: uav?.position.longitude,
    latitude: uav?.position.latitude,
    payload: uav ? { ...uav.payload } : emptyPayload(),
  };
}
export function validateUav(input: UavInput, list: readonly Uav[], editingId?: string) {
  const errors: Partial<Record<keyof UavInput, string>> = {};
  if (!input.name.trim()) errors.name = "名称必填";
  else if (input.name.trim().length > 80) errors.name = "名称不能超过 80 字";
  const sn = input.serialNumber.trim().toUpperCase();
  if (!sn) errors.serialNumber = "SN 必填";
  else if (sn.length > 80) errors.serialNumber = "SN 不能超过 80 字";
  else if (list.some((uav) => uav.id !== editingId && uav.serialNumber.toUpperCase() === sn))
    errors.serialNumber = "SN 已存在（忽略大小写及首尾空格）";
  if (!input.model.trim() || input.model.trim().length > 80) errors.model = "型号必填，最多 80 字";
  if (input.organization.trim().length > 120) errors.organization = "所属单位最多 120 字";
  if (!Object.hasOwn(uavStatuses, input.status)) errors.status = "状态无效";
  if (
    typeof input.longitude !== "number" ||
    !Number.isFinite(input.longitude) ||
    Math.abs(input.longitude) > 180
  )
    errors.longitude = "请输入 -180 至 180 的经度";
  if (
    typeof input.latitude !== "number" ||
    !Number.isFinite(input.latitude) ||
    Math.abs(input.latitude) > 90
  )
    errors.latitude = "请输入 -90 至 90 的纬度";
  if (
    Object.keys(emptyPayload()).some(
      (key) => typeof input.payload?.[key as keyof typeof input.payload] !== "boolean"
    )
  )
    errors.payload = "载荷能力必须为布尔值";
  return errors;
}
export function filterUavs(list: readonly Uav[], query: UavQuery) {
  const keyword = query.keyword.trim().toLocaleLowerCase();
  return list.filter(
    (uav) =>
      (!query.status || uav.status === query.status) &&
      (!query.model || uav.model === query.model) &&
      (!keyword ||
        [uav.name, uav.serialNumber, uav.organization].some((value) =>
          value.toLocaleLowerCase().includes(keyword)
        ))
  );
}
