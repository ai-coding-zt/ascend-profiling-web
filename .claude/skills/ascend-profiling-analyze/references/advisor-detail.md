# advisor 子功能完整参考

<!-- source: https://gitee.com/ascend/mstt/blob/master/profiler/msprof_analyze/advisor/README.md -->

## 简介

msprof-analyze 的 advisor 功能将 Ascend PyTorch Profiler 或 MindSpore Profiler 采集的性能数据进行分析，并输出性能调优建议。

## 约束

- CANN 8.0RC1 之前仅支持 text 格式文件分析
- CANN 8.0RC1 及之后支持 text、db 格式

## 命令格式

```bash
# 总体性能瓶颈（推荐）
msprof-analyze advisor all -d {profiling_path} [-bp benchmark_path] [-o output_path] \
  [-cv cann_version] [-tv torch_version] [-pt profiling_type] [--force] [-l language]

# 计算瓶颈
msprof-analyze advisor computation -d {profiling_path} [-o output_path] [options]

# 调度瓶颈
msprof-analyze advisor schedule -d {profiling_path} [-o output_path] [options]
```

**路径说明：**
- 单卡：指定到 `*_ascend_pt` 或 `*_ascend_ms` 目录
- 多卡/集群：指定到上述目录的父目录

## 参数说明

| 参数 | 说明 | 必选 |
|------|------|------|
| `-d` / `--profiling_path` | 性能数据路径 | 是 |
| `-bp` / `--benchmark_profiling_path` | 标杆数据路径（仅 all 支持） | 否 |
| `-o` / `--output_path` | 输出路径，默认当前目录 | 否 |
| `-cv` / `--cann_version` | CANN 版本号，默认 8.0.RC1 | 否 |
| `-tv` / `--torch_version` | torch 版本，默认 1.11.0 | 否 |
| `-pt` / `--profiling_type` | 采集工具类型：pytorch（默认）/ mindspore / mslite | 否 |
| `--force` | 强制执行 | 否 |
| `-l` / `--language` | 输出语言：cn（默认）/ en | 否 |
| `--debug` | 调试模式，显示详细堆栈 | 否 |

## 分析维度完整列表

### overall 模块

| mode | 说明 | 支持场景 |
|------|------|----------|
| Overall Summary | 计算/通信/空闲维度性能拆解 | PyTorch, MindSpore |
| Environment Variable Issues | 环境变量设置推荐 | PyTorch |
| slow rank | 慢卡识别 | PyTorch, MindSpore |
| slow link | 慢链路识别 | PyTorch, MindSpore |

### computation 模块

| mode | 说明 | 支持场景 |
|------|------|----------|
| AICPU Issues | AI CPU 调优 | PyTorch, MindSpore |
| Operator Dynamic Shape Issues | 动态 Shape 算子识别 | PyTorch |
| AI Core Performance Analysis | MatMul/FlashAttention/AI_VECTOR_CORE/MIX_AIV 分析 | PyTorch |
| Block Dim Issues | Block Dim 算子调优 | PyTorch, MindSpore |
| Operator No Bound Issues | 算子瓶颈分析 | PyTorch, MindSpore |
| Fusion Issues | 融合算子图调优 | PyTorch, MindSpore |
| AI Core Frequency Issues | AI Core 降频分析 | PyTorch, MindSpore |

### communication 模块

| mode | 说明 | 支持场景 |
|------|------|----------|
| Packet Analysis | 通信小包检测 | PyTorch, MindSpore |
| Bandwidth Contention Analysis | 通信计算带宽抢占检测 | PyTorch, MindSpore |
| Communication Retransmission Analysis | 通信重传检测 | PyTorch, MindSpore |
| Byte Alignment Analysis | 通信算子字节对齐检测（SDMA 需 512B 对齐） | PyTorch, MindSpore |

### schedule 模块

| mode | 说明 | 支持场景 |
|------|------|----------|
| Affinity API Issues | 亲和 API 替换调优 | PyTorch, MindSpore |
| Operator Dispatch Issues | 算子下发问题（路径3/路径5） | PyTorch |
| SyncBatchNorm Issues | BatchNorm 同步检测 | PyTorch, MindSpore |
| Synchronize Stream Issues | 流同步检测 | PyTorch, MindSpore |
| GC Analysis | 异常垃圾回收检测（需开启 gc_detect_threshold） | PyTorch |
| Fusible Operator Analysis | Host/MTE 瓶颈算子序列检测 | PyTorch, MindSpore |

### 其他模块

| 模块 | mode | 说明 |
|------|------|------|
| dataloader | Slow Dataloader Issues | 异常 dataloader 检测 |
| memory | Memory Operator Issues | 异常内存申请释放 |
| comparison | Kernel compare | Kernel 数据对比（快慢卡/有标杆） |
| | API compare | API 数据对比（快慢卡/有标杆） |

## 输出文件

| 文件 | 说明 |
|------|------|
| `mstt_advisor_{timestamp}.html` | 按优先级标记的优化建议（红=High, 黄=Medium, 绿=Low） |
| `mstt_advisor_{timestamp}.xlsx` | 详细分析数据（包含完整 comparison 数据） |

html 文件中 comparison 模块仅展示 Top 10，完整数据需查看 xlsx。

## 报告解读

### 无标杆模式

- **Overall Summary**：按计算/通信/下发三维度拆解耗时，识别主要瓶颈
- **集群场景**自动进行快慢卡和快慢链路分析
- **comparison**：集群内部快慢卡之间的 Kernel/API 数据对比
  - Diff Ratio > 1：当前环境更优
  - Diff Ratio < 1：待优化
  - inf：分母为 0
  - None：未获取到数据

### 有标杆模式（-bp）

- 两个集群之间存在明显耗时差异的相同卡之间的对比
- comparison 对比的是 Target vs Benchmark 数据

### Fusible Operator Analysis 输出

| 字段 | 说明 |
|------|------|
| start index | 序列起始算子在 kernel_details.csv 中的索引 |
| end index | 序列末尾算子索引 |
| total time(us) | 算子序列总耗时（含间隙） |
| execution time(us) | 算子执行总耗时 |
| mte time(us) | 搬运总耗时 |
| occurrences | 序列出现次数 |
| mte bound | 是否 MTE 瓶颈 |
| host bound | 是否 Host 瓶颈 |

## 常见调优操作

### 消除 aclOpCompile（下发优化）

```python
# 在脚本最开头添加
torch_npu.npu.set_compile_mode(jit_compile=False)
torch_npu.npu.config.allow_internal_format = False
```

### GC 优化

```python
import gc
gc.set_threshold(0)  # 禁用自动 GC
# 或
gc.disable()
```

### 环境变量推荐

```bash
export ACLNN_CACHE_LIMIT=10000   # ACLNN 缓存上限
export HOST_CACHE_CAPACITY=20    # Host 缓存容量（GB）
```
