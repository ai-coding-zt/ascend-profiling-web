# 数据流水线瓶颈分析

## 场景描述

训练中 GPU/NPU 利用率低，怀疑数据加载成为瓶颈，或 step_trace 中 Data_aug Bound 占比显著。

## 前提条件

- 已采集性能数据并导出 step_trace CSV
- 或已安装 `msprof-analyze`

## 分析步骤

### 方法一：使用 advisor

```bash
msprof-analyze advisor all -d ./prof_data
```

advisor 的 dataloader 模块（Slow Dataloader Issues）会自动检测异常高耗时的 dataloader 调用。

### 方法二：从 step_trace 分析

```bash
python scripts/parse_step_trace.py -f step_trace_time.csv
```

关注 `Data_aug Bound` 和 `Iteration Refresh` 字段。

### 方法三：从 Perfetto UI 观察

1. 在 timeline 中查找 DataLoader 相关事件
2. 观察前一个 step 结束到下一个 step 开始之间的间隙
3. 长间隙说明数据加载成为瓶颈

## 关键指标与阈值

| 指标 | 说明 | 阈值 |
|------|------|------|
| Data_aug Bound | 数据预处理等待时间 | 占 step 耗时 < 5% |
| Iteration Refresh | 迭代刷新时间 | 应很小 |
| DataLoader 单次耗时 | 单次数据加载耗时 | < 计算耗时的 10% |

## 常见问题与对策

| 优化方向 | 具体措施 |
|----------|----------|
| 增加数据加载并行度 | `DataLoader(num_workers=N)`，N 通常为 CPU 核数的 1/4~1/2 |
| 内存锁定 | `DataLoader(pin_memory=True)` 减少 CPU→NPU 拷贝开销 |
| 预取 | `DataLoader(prefetch_factor=N)` 提前加载后续批次 |
| 硬件加速预处理 | 使用 DVPP 硬件加速图像/视频预处理 |
| 数据格式 | 使用 MindRecord/TFRecord 等高效序列化格式 |
| 磁盘 I/O | 使用 SSD/NVMe、增大 OS 文件缓存 |
| 持久化 Worker | `DataLoader(persistent_workers=True)` 避免反复创建进程 |
