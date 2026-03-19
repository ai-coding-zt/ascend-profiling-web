# 可视化工具完整参考

## Perfetto UI

### 简介

Perfetto UI 是 Google 开源的 Trace 可视化工具，支持查看昇腾 Profiling 导出的 timeline JSON 文件。

### 使用方式

1. 打开 https://ui.perfetto.dev/
2. 点击 "Open trace file" 加载文件：
   - PyTorch Profiler：`trace_view.json`
   - msprof：`msprof_*.json`
3. 浏览和分析 timeline

### 导航快捷键

| 快捷键 | 功能 |
|--------|------|
| `W` / `S` | 放大 / 缩小时间轴 |
| `A` / `D` | 左 / 右平移 |
| `F` | 适应选中区域 |
| `/` | 搜索算子名称 |
| `M` | 标记当前选中区域 |
| 鼠标拖拽 | 选择时间范围 |

### 关键观察点

1. **算子间空隙**：长间隙表示 Host 下发瓶颈或流同步
2. **长耗时算子**：按耗时排序定位 Top-N 慢算子
3. **通信气泡**：非重叠通信区域表示计算/通信未流水
4. **Stream 利用率**：多 Stream 是否充分利用
5. **Memory 层**：内存分配/释放时间分布

### 搜索与过滤

- 使用 `/` 打开搜索框
- 支持正则表达式匹配算子名称
- 可按 Thread/Process 过滤显示

## MindStudio Insight

### 简介

MindStudio Insight 是华为提供的专业性能分析可视化工具，支持 .db 格式的 Profiling 数据。

### 安装

下载地址：https://www.hiascend.com/software/mindstudio

### 支持的文件

- `ascend_pytorch_profiler_*.db`（PyTorch Profiler 输出）
- `msprof_*.db`（msprof 输出）
- `analysis.db`（分析 db）

### 分析视图

| 视图 | 说明 |
|------|------|
| Timeline | 时间线视图，类似 Perfetto |
| Operator Statistics | 算子统计（调用次数、耗时） |
| Communication Analysis | 通信分析（带宽、耗时） |
| Memory Analysis | 内存分析（峰值、分配） |
| Step Trace | 迭代轨迹分析 |
| Cluster Analysis | 集群分析（多卡对比） |

### 优势

- 原生支持昇腾特有的分析维度
- 支持 .db 格式的丰富数据
- 集成集群分析和通信矩阵可视化

## torch-tb-profiler-ascend

### 简介

TensorBoard 的昇腾 Profiling 插件，适合习惯 TensorBoard 界面的 PyTorch 用户。

### 安装

```bash
pip install torch-tb-profiler-ascend
```

### 使用

```bash
# 启动 TensorBoard
tensorboard --logdir=./result

# 在浏览器中打开（默认 http://localhost:6006）
```

### 支持的视图

| 视图 | 说明 |
|------|------|
| Overview | 性能概览 |
| Operator | 算子统计视图 |
| Trace | 时间线视图 |
| Memory | 内存使用视图 |
| Distributed | 分布式训练视图 |

### 数据要求

需要 PyTorch Profiler 使用 `tensorboard_trace_handler` 输出数据：

```python
with torch_npu.profiler.profile(
    on_trace_ready=torch_npu.profiler.tensorboard_trace_handler("./result"),
    ...
) as prof:
    ...
```

## Timeline 合并工具

### merge_profiling_timeline

用于合并多个 timeline JSON 文件，适合需要对比多卡 timeline 的场景。

```bash
# 合并多个 trace_view.json
python -c "
from torch_npu.profiler import merge_profiling_timeline
merge_profiling_timeline('./result')
"
```

合并后的文件可在 Perfetto UI 中同时查看多卡的 timeline。
