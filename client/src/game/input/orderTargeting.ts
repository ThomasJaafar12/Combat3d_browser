import type { OrderId } from "@/game/defs";

export type GroundTargetOrderId = Extract<OrderId, "defend_area" | "hold_position" | "retreat">;

export interface OrderTargetingState {
  orderId: GroundTargetOrderId;
}

export const orderTargetingHotkeys: Record<string, GroundTargetOrderId> = {
  KeyQ: "defend_area",
  KeyH: "hold_position",
  KeyT: "retreat",
};

export const isGroundTargetOrder = (orderId: OrderId): orderId is GroundTargetOrderId =>
  orderId === "defend_area" || orderId === "hold_position" || orderId === "retreat";
