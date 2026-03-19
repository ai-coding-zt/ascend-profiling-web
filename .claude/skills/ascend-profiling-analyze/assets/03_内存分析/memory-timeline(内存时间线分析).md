# 内存时间线分析

## 场景描述

需要了解训练过程中内存的动态变化，定位内存尖峰对应的操作。

## 前提条件

- 采集时开启了内存相关数据
- 已导出 trace_view.json 或 .db 文件

## 分析步骤

### 方法一：Perfetto UI

1. 打开 https://ui.perfetto.dev/
2. 加载 trace_view.json
3. 在 timeline 中找到 Memory 相关 track
4. 观察内存分配/释放随时间的变化曲线
5. 点击内存尖峰处，查看对应时间点的算子

### 方法二：MindStudio Insight

1. 打开 .db 文件
2. 切换到 Memory Analysis 视图
3. 查看内存时间线和算子级分配详情

### 方法三：从 CSV 绘制

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("npu_mem_0.csv")
plt.figure(figsize=(15, 5))
plt.plot(df["Timestamp(us)"], df["Total Allocated(MB)"], label="Allocated")
plt.plot(df["Timestamp(us)"], df["Total Reserved(MB)"], label="Reserved")
plt.xlabel("Time (us)")
plt.ylabel("Memory (MB)")
plt.legend()
plt.title("NPU Memory Timeline")
plt.savefig("memory_timeline.png")
```

## 关键指标与阈值

| 观察点 | 说明 |
|--------|------|
| 内存尖峰 | 对应前向传播中的大 tensor 或激活值 |
| 阶梯式增长 | 可能是内存泄漏 |
| 前向/反向分界 | 反向传播开始时内存应开始释放 |
| 通信时内存 | AllGather 等通信会临时增加内存占用 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| 前向传播内存尖峰过高 | 使用 activation checkpointing |
| 内存持续增长不释放 | 排查 Python 引用计数、tensor 未释放 |
| 通信阶段内存飙升 | ZeRO-3 的 AllGather 会临时占用更多内存，属正常现象 |
| 内存碎片化（Reserved >> Allocated） | 调整 memory allocator 配置 |
