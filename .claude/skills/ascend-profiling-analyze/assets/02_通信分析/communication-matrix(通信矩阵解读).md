# 通信矩阵解读

## 场景描述

集群训练中需要了解各 Rank 之间的通信模式和数据量，识别慢链路和通信不均衡问题。

## 前提条件

- 已采集多卡/集群的性能数据
- 已安装 `msprof-analyze`

## 分析步骤

### 生成通信矩阵

```bash
msprof-analyze -m communication_matrix -d ./cluster_data
```

输出 `cluster_communication_matrix.json`。

### 通信矩阵汇总

```bash
msprof-analyze -m communication_matrix_sum -d ./cluster_data
```

### 通信域映射

```bash
msprof-analyze -m communication_group_map -d ./cluster_data
```

### 在 MindStudio Insight 中查看

将 .db 格式数据在 MindStudio Insight 中打开，可以看到通信矩阵的热力图视图。

## 关键指标与阈值

| 指标 | 说明 |
|------|------|
| Rank 间通信量 | 各 Rank 对之间的数据传输量（MB） |
| 通信带宽 | 实际带宽 vs HCCS/PCIe/RoCE 理论峰值 |
| 通信均衡性 | 各 Rank 的通信量应大致均衡 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| 某对 Rank 间通信量异常大 | 检查并行策略配置，是否存在不合理的通信模式 |
| 通信不均衡 | 调整 TP/PP/DP 分组，优化网络拓扑感知 |
| 跨节点通信量大 | 将高通信量的 Rank 放在同一节点内（利用 HCCS 高带宽） |
| 带宽利用率低 | 检查字节对齐、通信小包问题 |
