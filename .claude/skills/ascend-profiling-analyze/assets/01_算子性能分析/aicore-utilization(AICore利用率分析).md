# AI Core 利用率分析

## 场景描述

需要判断算子是计算受限（Compute Bound）还是搬运受限（Memory Bound），以确定优化方向。

## 前提条件

- 采集时开启了 AI Core 指标：
  - PyTorch: `aic_metrics=torch_npu.profiler.AiCMetrics.PipeUtilization`
  - msprof: `--aic-metrics=PipeUtilization` 或 `ArithmeticUtilization`
- 已导出 op_summary CSV

## 分析步骤

### 方法一：使用 advisor（推荐）

```bash
msprof-analyze advisor computation -d ./prof_data
```

advisor 会自动进行 AI Core Performance Analysis，输出 MatMul、FlashAttention 等算子的性能分析。

### 方法二：手动分析 PipeUtilization 指标

op_summary 中的关键字段（需 `aic_metrics=PipeUtilization`）：

| 字段 | 说明 |
|------|------|
| Mac Ratio | 矩阵计算单元利用率 |
| Vec Ratio | 向量计算单元利用率 |
| Scalar Ratio | 标量计算单元利用率 |
| MTE1 Ratio | L1 → L0 搬运利用率 |
| MTE2 Ratio | L2/HBM → L1 搬运利用率 |
| MTE3 Ratio | L0 → L2/HBM 搬运利用率 |

### 瓶颈判定规则

```python
import pandas as pd

df = pd.read_csv("op_summary_0.csv")

for _, row in df.iterrows():
    mac = row.get("Mac Ratio", 0)
    mte2 = row.get("MTE2 Ratio", 0)

    if mac > mte2:
        bound = "Compute Bound"
    elif mte2 > mac:
        bound = "Memory Bound"
    else:
        bound = "Balanced"
    # ...
```

## 关键指标与阈值

| 场景 | Mac Ratio | MTE Ratio | 优化方向 |
|------|-----------|-----------|----------|
| Compute Bound | > 50% | < Mac | 减少计算量、使用更高效算子 |
| Memory Bound | < MTE | > 50% | 优化数据布局、减少搬运次数 |
| Balanced | ≈ MTE | ≈ Mac | 计算和搬运都已充分利用 |
| Under-utilized | < 30% | < 30% | Block Dim 不足或下发间隙过大 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| MatMul Mac Ratio 低 | 检查 M/N/K 维度是否对齐，调整 batch size |
| MTE2 Ratio 很高 | 数据搬运是瓶颈，优化内存布局或使用 L2 Cache |
| 所有 Ratio 都低 | 检查 Block Dim、算子是否落在 AI_CPU |
| AI Core 频率降低 | advisor 的 freq_analysis 可检测降频问题 |
