# 峰值内存分析

## 场景描述

训练或推理中出现 OOM（Out of Memory），或需要评估模型的 HBM 内存占用以优化 batch size。

## 前提条件

- 采集时开启了内存相关数据：
  - PyTorch: `profile_memory=True`
  - msprof: `--task-memory=on`
- 已导出 `npu_mem_*.csv`

## 分析步骤

### 读取 npu_mem CSV

```python
import pandas as pd

df = pd.read_csv("npu_mem_0.csv")
# 查看峰值内存
peak = df["Total Reserved(MB)"].max()
print(f"峰值内存: {peak:.1f} MB")

# 各时间点的内存使用
print(df[["Timestamp(us)", "Total Reserved(MB)", "Total Allocated(MB)"]].describe())
```

### 与设备容量对比

| 设备 | HBM 容量 |
|------|----------|
| Atlas 300I Pro | 8 GB |
| Atlas 800 (Ascend 910) | 32 GB |
| Atlas 800T A2 (Ascend 910B) | 64 GB |
| Atlas 900 A2 (Ascend 910B) | 64 GB |

## 关键指标与阈值

| 指标 | 说明 | 阈值 |
|------|------|------|
| Peak Reserved | 峰值预留内存 | < 设备容量 90% |
| Peak Allocated | 峰值实际分配内存 | 关注与 Reserved 的差距 |
| Fragmentation | Reserved - Allocated | 过大说明内存碎片化 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| 峰值内存接近设备上限 | 减小 batch size、使用混合精度、开启重计算 |
| 内存碎片化严重 | 使用 memory pool 优化、调整分配策略 |
| 内存持续增长 | 检查是否存在内存泄漏（tensor 未释放） |
| 模型并行可降低单卡内存 | 使用 TP/PP 将模型分布到多卡 |
