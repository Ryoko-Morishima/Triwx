// src/server/policyCache.ts — 方針キャッシュ（fillとwarmで共有）
// カード・スライダー変更の瞬間に warm で先に方針を作っておくことで、
// 変更後1曲目の補充レイテンシから方針生成(LLM)ぶんを消す。
import { buildPolicy, type Policy, type StationState } from "@/pipeline/core";

const cache = new Map<string, Policy>();
const building = new Map<string, Promise<Policy>>();

export function defaultPolicy(state: StationState): Policy {
  return {
    stateVersion: state.version,
    directive:
      "心地よく聴き続けられる選曲。前の曲からの流れを大切に、幅広いジャンル・地域・年代からバランスよく選ぶ。",
  };
}

/** キャッシュ優先で方針を返す。生成中なら合流し、二重生成しない */
export async function getOrBuildPolicy(
  sessionId: string,
  state: StationState,
): Promise<Policy> {
  const key = `${sessionId}:${state.version}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let pending = building.get(key);
  if (!pending) {
    pending = buildPolicy(state)
      .then((p) => {
        cache.set(key, p);
        return p;
      })
      .finally(() => building.delete(key));
    building.set(key, pending);
  }
  return pending;
}
