import type { BlackBoxCause, BlackBoxEvidence, BlackBoxFeatureName, BlackBoxFeatures } from '../../domain/types';
import { BLACKBOX_MODEL } from './data/modelData';
import { BLACKBOX_FEATURES } from './extract';

export const BLACKBOX_CAUSES: BlackBoxCause[] = [
  'offplan_handling', 'traffic', 'reefer_failure', 'route_deviation', 'breakdown', 'driver_rest',
];

const { logp, T } = BLACKBOX_MODEL;

function lp(cause: BlackBoxCause, feature: BlackBoxFeatureName, value: string): number | undefined {
  return logp[cause][feature][value];
}

/** Xác suất hậu nghiệm (Naive Bayes, prior đều) đã hiệu chỉnh bằng temperature scaling. Tổng = 1. */
export function posterior(features: BlackBoxFeatures): Record<BlackBoxCause, number> {
  const score = {} as Record<BlackBoxCause, number>;
  for (const c of BLACKBOX_CAUSES) {
    let s = 0;
    for (const k of BLACKBOX_FEATURES) {
      const v = features[k];
      if (v === null) continue;
      const x = lp(c, k, v);
      if (x !== undefined) s += x;
    }
    score[c] = s;
  }
  const mx = Math.max(...Object.values(score));
  const e = {} as Record<BlackBoxCause, number>;
  let z = 0;
  for (const c of BLACKBOX_CAUSES) {
    e[c] = Math.exp((score[c] - mx) / T);
    z += e[c];
  }
  for (const c of BLACKBOX_CAUSES) e[c] /= z;
  return e;
}

/** LLR của từng bằng chứng so với trung bình các giả thuyết khác: >0 ủng hộ, <0 phản bác. */
export function evidenceFor(features: BlackBoxFeatures, cause: BlackBoxCause): BlackBoxEvidence[] {
  const out: BlackBoxEvidence[] = [];
  for (const k of BLACKBOX_FEATURES) {
    const v = features[k];
    if (v === null) continue;
    const own = lp(cause, k, v);
    if (own === undefined) continue;
    const others = BLACKBOX_CAUSES.filter((c) => c !== cause).map((c) => lp(c, k, v) ?? own);
    const lo = Math.log(others.reduce((a, x) => a + Math.exp(x), 0) / others.length);
    out.push([k, v, (own - lo) / T]);
  }
  return out;
}

/** Giá trị phân biệt giữa 2 giả thuyết nếu biết thêm đặc trưng `feature` (đang thiếu). */
export function discriminationGain(feature: BlackBoxFeatureName, a: BlackBoxCause, b: BlackBoxCause): number {
  let gain = 0;
  for (const v of Object.keys(logp[a][feature])) {
    const pa = Math.exp(logp[a][feature][v]);
    const pb = Math.exp(logp[b][feature][v]);
    gain += pa * Math.abs(Math.log(pa / pb));
  }
  return gain;
}

export const BLACKBOX_STATS = BLACKBOX_MODEL.stats;
