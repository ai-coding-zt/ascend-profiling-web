# 集合通信分析

## 场景描述

分布式训练中通信耗时占比高，需要分析 AllReduce、AllGather、ReduceScatter 等集合通信算子的耗时和带宽利用率。

## 前提条件

- 已采集包含通信数据的性能数据
- 已导出 `communication_statistic_*.csv`
- 或已安装 `msprof-analyze`

## 分析步骤

### 方法一：使用 msprof-analyze

```bash
# 通信算子 Top-N 汇总
msprof-analyze -m hccl_sum -d ./prof_data --top_num 20

# 通信矩阵 + 耗时分析
msprof-analyze -m all -d ./cluster_data

# 通信时间和带宽汇总
msprof-analyze -m communication_time_sum -d ./cluster_data
```

### 方法二：使用本 skill 脚本

```bash
python scripts/parse_comm_stats.py -f communication_statistic_0.csv
```

### 方法三：手动 CSV 分析

```python
import pandas as pd

df = pd.read_csv("communication_statistic_0.csv")
# 按通信算子类型汇总
comm_stats = df.groupby("Op Type").agg(
    count=("Duration(us)", "count"),
    total_time=("Duration(us)", "sum"),
    avg_time=("Duration(us)", "mean"),
    total_size=("Size(MB)", "sum"),
).sort_values("total_time", ascending=False)
print(comm_stats)
```

## 关键指标与阈值

| 指标 | 说明 | 关注点 |
|------|------|--------|
| Duration(us) | 通信算子耗时 | 单次耗时异常高的算子 |
| Size(MB) | 通信数据量 | 数据量是否合理 |
| 带宽利用率 | Size / Duration vs 理论峰值 | < 50% 需关注 |
| 通信占比 | 通信总耗时 / 迭代总耗时 | > 30% 需优化 |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| AllReduce 耗时占比过高 | 梯度压缩、梯度累积、ZeRO 优化 |
| 带宽利用率低 | 检查通信算子字节对齐（SDMA 需 512B 对齐） |
| 通信小包过多 | 增大 bucket_size（gradient bucketing） |
| 通信重传 | 检查网络链路质量 |
