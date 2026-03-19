# 集群分析完整参考

<!-- source: https://gitee.com/ascend/mstt/blob/master/profiler/msprof_analyze/cluster_analyse/README.md -->

## 简介

集群分析功能提供多卡、多节点场景下的性能分析能力，包括通信矩阵、通信耗时、慢卡识别、流水线分析等。

## 命令格式

```bash
# version ≥ 8.2.0a1（直接使用）
msprof-analyze -m [mode] -d <cluster_profiling_path> [options]

# version < 8.2.0a1（需 cluster 子命令）
msprof-analyze cluster -m [mode] -d <cluster_profiling_path> [options]
```

## 数据准备

集群分析需要多卡的 profiling 数据汇集到同一目录下：

```
cluster_data/
├── rank_0/           # 或 *_ascend_pt 目录
│   └── PROF_XXX/
├── rank_1/
│   └── PROF_XXX/
├── ...
└── rank_N/
    └── PROF_XXX/
```

## 分析模式详解

### communication_matrix（通信矩阵）

分析各 Rank 之间的通信数据量和带宽。

```bash
msprof-analyze -m communication_matrix -d ./cluster_data
```

输出：`cluster_communication_matrix.json`
- 矩阵形式展示 Rank 间通信量
- 可在 MindStudio Insight 中可视化

### communication_time（通信耗时）

分析各通信算子的耗时分布。

```bash
msprof-analyze -m communication_time -d ./cluster_data
```

### all（默认）

同时执行 communication_matrix + communication_time + step_trace_time：

```bash
msprof-analyze -m all -d ./cluster_data
```

输出 `cluster_step_trace_time.csv`。

### slow_rank（慢卡识别）

根据快慢卡统计算法，展示各 Rank 的快慢卡影响次数，识别慢卡出现原因。

```bash
msprof-analyze -m slow_rank -d ./cluster_data
```

### pp_chart（流水线并行图）

针对 PP（Pipeline Parallelism）并行下各阶段的耗时分析与可视化。

```bash
msprof-analyze -m pp_chart -d ./cluster_data
```

关注指标：
- Bubble Ratio：流水线气泡占比
- Stage 耗时均衡性
- 各 micro-batch 的调度情况

### communication_group_map（通信域映射）

展示集群场景下通信域与并行策略（TP/PP/DP/ZeRO）的对应关系。

```bash
msprof-analyze -m communication_group_map -d ./cluster_data
```

### communication_time_sum / communication_matrix_sum

集群场景下的通信时间和带宽汇总分析 / 通信矩阵汇总分析。

```bash
msprof-analyze -m communication_time_sum -d ./cluster_data
msprof-analyze -m communication_matrix_sum -d ./cluster_data
```

### cluster_time_summary

性能数据细粒度拆解，生成更详细的 step_trace_time 分析。

```bash
msprof-analyze -m cluster_time_summary -d ./cluster_data
```

### cluster_time_compare_summary

两组集群数据的细粒度对比：

```bash
msprof-analyze -m cluster_time_compare_summary -d ./new_data --bp ./baseline_data
```

### hccl_sum（通信算子汇总）

通信类算子信息汇总，支持 Top-N 筛选：

```bash
msprof-analyze -m hccl_sum -d ./prof_data --top_num 20
```

## 输出文件说明

| 文件 | 来源模式 | 说明 |
|------|----------|------|
| cluster_step_trace_time.csv | all / cluster_time_summary | 各 Rank 每步的时间拆解 |
| cluster_communication_matrix.json | communication_matrix | Rank 间通信矩阵 |
| communication_time.csv | communication_time | 通信算子耗时统计 |
| slow_rank_result.csv | slow_rank | 慢卡统计结果 |
| pp_chart.html | pp_chart | 流水线并行可视化图 |

## 与 MindStudio Insight 集成

集群分析的输出（特别是 .db 格式）可直接在 MindStudio Insight 中打开：
- 通信矩阵热力图
- 各 Rank 性能拆解对比
- 流水线并行时序图

## 多节点数据采集前提

1. 各节点使用相同的 Profiling 配置
2. 采集数据汇集到同一目录（或共享存储）
3. 目录结构需包含 Rank 信息
4. 建议使用 `msprof` 或 `torch_npu.profiler` 统一采集
