# 算子类型分布分析

## 场景描述

需要了解模型中各类算子（MatMul、Elementwise、通信算子等）的耗时占比分布，找出哪类算子是性能瓶颈。

## 前提条件

- 已采集性能数据并导出 `op_summary_*.csv` 或 `kernel_details.csv`

## 分析步骤

### 按 OP Type 分组统计

```python
import pandas as pd

df = pd.read_csv("op_summary_0.csv")
# 按 OP Type 汇总
type_stats = df.groupby("OP Type").agg(
    count=("Task Duration(us)", "count"),
    total_time=("Task Duration(us)", "sum"),
    avg_time=("Task Duration(us)", "mean"),
    max_time=("Task Duration(us)", "max"),
).sort_values("total_time", ascending=False)

total = df["Task Duration(us)"].sum()
type_stats["占比(%)"] = (type_stats["total_time"] / total * 100).round(2)
type_stats["累计占比(%)"] = type_stats["占比(%)"].cumsum()
print(type_stats)
```

### 使用 msprof-analyze

```bash
msprof-analyze -m compute_op_sum -d ./prof_data
```

## 关键指标与阈值

| 指标 | 说明 |
|------|------|
| 类型总耗时占比 | 该类型所有算子的总耗时 / 全部算子总耗时 |
| 类型调用次数 | 该类型算子被调用的总次数 |
| 累计占比 | 前 N 种类型的累计耗时占比 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| Elementwise 占比过高 | 考虑使用融合算子（如 torch_npu 亲和 API） |
| Transpose/Reshape 占比高 | 优化数据布局，减少不必要的格式转换 |
| AICPU 类型算子占比高 | 替换为 AI Core 实现 |
| 单一类型占比 >50% | 重点优化该类型算子 |
