# 迭代时间分解分析

## 场景描述

需要了解每个训练迭代（step）的时间组成，找出计算、通信、空闲各占多少比例。

## 前提条件

- 已采集性能数据并导出 `step_trace_time.csv`
- 或已安装 `msprof-analyze`

## 分析步骤

### 方法一：使用本 skill 脚本

```bash
python scripts/parse_step_trace.py -f step_trace_time.csv
```

输出每个 step 的时间分解和统计信息（均值/标准差/最小/最大）。

### 方法二：使用 msprof-analyze

```bash
# 细粒度拆解
msprof-analyze -m cluster_time_summary -d ./cluster_data
```

### 方法三：手动分析

```python
import pandas as pd

df = pd.read_csv("step_trace_time.csv")
# 关键时间字段
time_cols = ["Computing", "Communication(Not Overlapped)", "Free", "Stage"]
for col in time_cols:
    if col in df.columns:
        pct = (df[col] / df["Duration"] * 100).mean()
        print(f"{col}: {pct:.1f}%")
```

## 关键指标与阈值

| 时间组成 | 说明 | 理想占比 |
|----------|------|----------|
| Computing | 前向 + 反向计算 | > 70% |
| Communication (Not Overlapped) | 未被计算重叠的通信 | < 15% |
| Free / Idle | 空闲/等待时间 | < 10% |
| Data_aug Bound | 数据预处理瓶颈 | < 5% |
| Iteration Refresh | 迭代刷新时间 | 应很小 |

### Step 间变异分析

```python
# 检查 step 间的波动
cv = df["Duration"].std() / df["Duration"].mean() * 100
print(f"Step 耗时变异系数: {cv:.1f}%")
# CV > 10% 说明 step 间不稳定，需排查原因
```

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| Computing 占比低 | 通信或空闲是瓶颈，优化通信重叠或减少流同步 |
| Free Time 高 | 检查 Host 下发性能、流同步、GC |
| Data_aug Bound 高 | 优化 DataLoader（num_workers、pin_memory、DVPP） |
| Step 间波动大 | 排查动态 Shape、GC、数据 I/O 不稳定 |
