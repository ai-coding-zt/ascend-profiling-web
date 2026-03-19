# 流水线并行分析

## 场景描述

使用 Pipeline Parallelism（PP）进行模型并行训练时，需要分析各 stage 的耗时均衡性和流水线气泡占比。

## 前提条件

- 使用了 PP 并行策略
- 已采集多卡性能数据
- 已安装 `msprof-analyze`

## 分析步骤

### 方法一：使用 pp_chart

```bash
msprof-analyze -m pp_chart -d ./cluster_data
```

输出 PP 流水图 HTML 文件，可在浏览器中查看。

### 方法二：使用 advisor

```bash
msprof-analyze advisor all -d ./cluster_data
```

当存在 PP stage 时，advisor 的 computation 模块会按 stage 分析。

### 方法三：从 cluster_step_trace_time 分析

```bash
msprof-analyze -m cluster_time_summary -d ./cluster_data
```

查看各 Rank 的时间拆解，按 stage 分组分析。

## 关键指标与阈值

| 指标 | 说明 | 理想值 |
|------|------|--------|
| Bubble Ratio | 流水线气泡占比 | < 10% |
| Stage 耗时方差 | 各 stage 耗时的标准差 | 越小越好 |
| Stage 最慢/最快比值 | 耗时最长 stage / 耗时最短 stage | < 1.1 |
| Micro-batch 数量 | PP 的 micro-batch 数 | 越大气泡越小 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| Bubble Ratio 高 | 增大 micro-batch 数量 |
| Stage 不均衡 | 调整各 stage 的层数分配 |
| 首尾 stage 空闲 | 使用 interleaved 1F1B 调度 |
| 特定 stage 耗时异常 | 检查该 stage 中是否有慢算子或通信瓶颈 |
