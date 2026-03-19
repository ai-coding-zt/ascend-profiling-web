# 算子内存分解

## 场景描述

需要定位哪些算子消耗了最多内存，以进行针对性的内存优化。

## 前提条件

- 采集时开启了算子级内存数据：
  - PyTorch: `profile_memory=True`
  - msprof: `--task-memory=on`
- 已导出 `operator_memory_*.csv` 或 `memory_record_*.csv`

## 分析步骤

### 读取 operator_memory CSV

```python
import pandas as pd

df = pd.read_csv("operator_memory_0.csv")
# 按分配量排序
top_mem = df.sort_values("Allocation Size(MB)", ascending=False).head(20)
print(top_mem[["Op Name", "Allocation Size(MB)", "Allocation Count"]])
```

### 使用 advisor

```bash
msprof-analyze advisor all -d ./prof_data
```

advisor 的 memory 模块会自动识别异常的内存申请释放操作。

## 关键指标与阈值

| 指标 | 说明 |
|------|------|
| Allocation Size | 单次内存分配大小 |
| Total Allocation | 累计分配量 |
| Allocation Count | 分配次数 |
| Op Name | 对应算子名称 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| 单次分配量过大 | 检查是否可以使用 inplace 操作 |
| 频繁小量分配 | 使用 memory pool 减少分配开销 |
| 激活值占用大量内存 | 使用重计算（activation checkpointing） |
| 优化器状态占内存 | 使用 ZeRO 优化器状态分片 |
