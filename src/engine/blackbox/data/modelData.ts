// FILE SINH TỰ ĐỘNG từ prototype Python (export_ts.py) — không sửa tay.
import type { BlackBoxModelData } from '../../../domain/types';

export const BLACKBOX_MODEL: BlackBoxModelData = {
 "T": 1.0,
 "logp": {
  "offplan_handling": {
   "stop_dur": {
    "long": -0.6892,
    "medium": -0.7172,
    "none": -6.2226,
    "short": -4.8363
   },
   "crawl": {
    "no": -0.002,
    "yes": -6.2186
   },
   "offroute": {
    "no": -0.002,
    "yes": -6.2186
   },
   "temp_exc": {
    "major": -0.0573,
    "mild": -2.9248,
    "none": -6.2206
   },
   "temp_onset": {
    "in_motion": -6.2186,
    "in_stop": -0.002
   },
   "temp_slope": {
    "fast": -0.002,
    "slow": -6.2186
   },
   "door": {
    "brief": -6.1003,
    "long": -0.0045,
    "no": -6.1003
   },
   "camera": {
    "no": -5.743,
    "yes": -0.0032
   },
   "engine_off": {
    "no": -0.0022,
    "yes": -6.1092
   },
   "fault": {
    "engine": -4.7252,
    "none": -0.0361,
    "reefer": -3.6266
   },
   "traffic_hi": {
    "no": -0.0637,
    "yes": -2.785
   },
   "count_mismatch": {
    "no": -0.881,
    "yes": -0.5351
   },
   "driver_contra": {
    "no": -1.4625,
    "yes": -0.2635
   },
   "delay": {
    "large": -6.2206,
    "moderate": -0.006,
    "small": -5.5274
   }
  },
  "traffic": {
   "stop_dur": {
    "long": -1.8531,
    "medium": -1.9599,
    "none": -0.3618,
    "short": -5.124
   },
   "crawl": {
    "no": -1.208,
    "yes": -0.355
   },
   "offroute": {
    "no": -0.002,
    "yes": -6.2186
   },
   "temp_exc": {
    "major": -6.2206,
    "mild": -6.2206,
    "none": -0.004
   },
   "temp_onset": {
    "in_motion": -0.6931,
    "in_stop": -0.6931
   },
   "temp_slope": {
    "fast": -0.6931,
    "slow": -0.6931
   },
   "door": {
    "brief": -3.0692,
    "long": -6.1137,
    "no": -0.0499
   },
   "camera": {
    "no": -0.0285,
    "yes": -3.5711
   },
   "engine_off": {
    "no": -0.0073,
    "yes": -4.9273
   },
   "fault": {
    "engine": -4.3307,
    "none": -0.0312,
    "reefer": -4.0431
   },
   "traffic_hi": {
    "no": -6.0234,
    "yes": -0.0024
   },
   "count_mismatch": {
    "no": -0.0188,
    "yes": -3.9849
   },
   "driver_contra": {
    "no": -0.0168,
    "yes": -4.0967
   },
   "delay": {
    "large": -5.5274,
    "moderate": -0.016,
    "small": -4.4288
   }
  },
  "reefer_failure": {
   "stop_dur": {
    "long": -6.2226,
    "medium": -6.2226,
    "none": -0.006,
    "short": -6.2226
   },
   "crawl": {
    "no": -0.002,
    "yes": -6.2186
   },
   "offroute": {
    "no": -0.002,
    "yes": -6.2186
   },
   "temp_exc": {
    "major": -0.3152,
    "mild": -1.3153,
    "none": -6.2206
   },
   "temp_onset": {
    "in_motion": -0.002,
    "in_stop": -6.2186
   },
   "temp_slope": {
    "fast": -6.2186,
    "slow": -0.002
   },
   "door": {
    "brief": -2.9693,
    "long": -6.1048,
    "no": -0.0551
   },
   "camera": {
    "no": -0.0483,
    "yes": -3.0547
   },
   "engine_off": {
    "no": -0.6931,
    "yes": -0.6931
   },
   "fault": {
    "engine": -4.0604,
    "none": -1.0647,
    "reefer": -0.4495
   },
   "traffic_hi": {
    "no": -0.6931,
    "yes": -0.6931
   },
   "count_mismatch": {
    "no": -0.0251,
    "yes": -3.6972
   },
   "driver_contra": {
    "no": -0.0023,
    "yes": -6.0591
   },
   "delay": {
    "large": -6.2206,
    "moderate": -6.2206,
    "small": -0.004
   }
  },
  "route_deviation": {
   "stop_dur": {
    "long": -6.2226,
    "medium": -6.2226,
    "none": -0.014,
    "short": -4.6131
   },
   "crawl": {
    "no": -0.002,
    "yes": -6.2186
   },
   "offroute": {
    "no": -6.2186,
    "yes": -0.002
   },
   "temp_exc": {
    "major": -6.2206,
    "mild": -6.2206,
    "none": -0.004
   },
   "temp_onset": {
    "in_motion": -0.6931,
    "in_stop": -0.6931
   },
   "temp_slope": {
    "fast": -0.6931,
    "slow": -0.6931
   },
   "door": {
    "brief": -2.6991,
    "long": -6.1003,
    "no": -0.072
   },
   "camera": {
    "no": -0.0242,
    "yes": -3.7343
   },
   "engine_off": {
    "no": -0.2231,
    "yes": -1.6094
   },
   "fault": {
    "engine": -4.2973,
    "none": -0.0299,
    "reefer": -4.1431
   },
   "traffic_hi": {
    "no": -0.2877,
    "yes": -1.3863
   },
   "count_mismatch": {
    "no": -0.0234,
    "yes": -3.7675
   },
   "driver_contra": {
    "no": -0.8764,
    "yes": -0.5383
   },
   "delay": {
    "large": -6.2206,
    "moderate": -0.9895,
    "small": -0.468
   }
  },
  "breakdown": {
   "stop_dur": {
    "long": -0.129,
    "medium": -2.145,
    "none": -6.2226,
    "short": -6.2226
   },
   "crawl": {
    "no": -0.002,
    "yes": -6.2186
   },
   "offroute": {
    "no": -0.002,
    "yes": -6.2186
   },
   "temp_exc": {
    "major": -2.3086,
    "mild": -0.357,
    "none": -1.6055
   },
   "temp_onset": {
    "in_motion": -5.9965,
    "in_stop": -0.0025
   },
   "temp_slope": {
    "fast": -4.8978,
    "slow": -0.0075
   },
   "door": {
    "brief": -3.0315,
    "long": -6.1225,
    "no": -0.0518
   },
   "camera": {
    "no": -0.0504,
    "yes": -3.0134
   },
   "engine_off": {
    "no": -6.089,
    "yes": -0.0023
   },
   "fault": {
    "engine": -0.4146,
    "none": -1.1077,
    "reefer": -4.705
   },
   "traffic_hi": {
    "no": -0.1279,
    "yes": -2.1194
   },
   "count_mismatch": {
    "no": -0.0333,
    "yes": -3.4177
   },
   "driver_contra": {
    "no": -0.053,
    "yes": -2.9634
   },
   "delay": {
    "large": -0.5787,
    "moderate": -0.827,
    "small": -6.2206
   }
  },
  "driver_rest": {
   "stop_dur": {
    "long": -1.5878,
    "medium": -0.3761,
    "none": -5.5294,
    "short": -2.2523
   },
   "crawl": {
    "no": -0.002,
    "yes": -6.2186
   },
   "offroute": {
    "no": -0.002,
    "yes": -6.2186
   },
   "temp_exc": {
    "major": -6.2206,
    "mild": -6.2206,
    "none": -0.004
   },
   "temp_onset": {
    "in_motion": -0.6931,
    "in_stop": -0.6931
   },
   "temp_slope": {
    "fast": -0.6931,
    "slow": -0.6931
   },
   "door": {
    "brief": -3.0933,
    "long": -6.089,
    "no": -0.0488
   },
   "camera": {
    "no": -0.0486,
    "yes": -3.0479
   },
   "engine_off": {
    "no": -1.7873,
    "yes": -0.1832
   },
   "fault": {
    "engine": -3.8067,
    "none": -0.0501,
    "reefer": -3.6243
   },
   "traffic_hi": {
    "no": -0.0737,
    "yes": -2.644
   },
   "count_mismatch": {
    "no": -0.0388,
    "yes": -3.2687
   },
   "driver_contra": {
    "no": -0.3881,
    "yes": -1.1342
   },
   "delay": {
    "large": -6.2206,
    "moderate": -0.1047,
    "small": -2.3288
   }
  }
 },
 "stats": {
  "top1": 0.979,
  "chance": 0.167,
  "tiers": [
   [
    "A. Chỉ GPS + chứng từ + lời khai",
    0.822
   ],
   [
    "B. A + nhiệt độ + telemetry động cơ",
    0.949
   ],
   [
    "C. B + cảm biến cửa",
    0.95
   ],
   [
    "D. Đầy đủ (thêm camera + dữ liệu giao thông)",
    0.983
   ]
  ],
  "mixedExactPair": 0.628,
  "worstCase": 0.748
 }
};
