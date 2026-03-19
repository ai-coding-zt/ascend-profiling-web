# 通信计算重叠分析

## 场景描述

分布式训练中，通信和计算应尽量重叠以隐藏通信开销。当迭代耗时中通信不被计算隐藏时，需要分析重叠率并优化。

## 前提条件

- 已采集性能数据并导出 `step_trace_time.csv`
- 或已安装 `msprof-analyze`

## 分析步骤

### 方法一：从 step_trace 分析

```bash
python scripts/parse_step_trace.py -f step_trace_time.csv
```

关注字段：
- **Computing Time**：纯计算耗时
- **Communication (Not Overlapped)**：未被计算重叠的通信耗时
- **Free Time**：空闲时间

### 方法二：使用 msprof-analyze

```bash
# 细粒度时间拆解
msprof-analyze -m cluster_time_summary -d ./cluster_data
```

### 方法三：从 Perfetto UI 观察

1. 加载 trace_view.json
2. 观察 Communication 和 Computing 的时间区域是否重叠
3. 非重叠区域（通信气泡）是性能损失点

## 关键指标与阈值

| 指标 | 计算方式 | 理想值 |
|------|----------|--------|
| 重叠率 | 1 - (Communication Not Overlapped / Total Communication) | > 80% |
| 通信气泡时间 | Communication Not Overlapped | 越小越好 |
| 空闲时间占比 | Free Time / Step Time | < 10% |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| 重叠率 < 50% | 使用 gradient bucketing 实现梯度通信流水 |
| 大块通信气泡 | 调整通信和计算的编排，考虑异步通信 |
| Free Time 高 | 检查流同步、Host 下发是否存在瓶颈 |
| 仅反向传播末尾有大量通信 | 开启梯度累积或拆分通信 |
