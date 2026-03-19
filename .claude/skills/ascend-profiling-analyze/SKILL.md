---
name: ascend-prof-analyze
description: |
  华为昇腾AI处理器性能数据分析与调优指南。覆盖 msprof-analyze 工具（advisor、compare、
  cluster_analyse）、算子/通信/内存/集群多维度性能瓶颈定位与调优建议。当用户提到 Ascend
  性能分析、性能瓶颈定位、算子耗时排序、通信分析、集群慢卡、性能对比、advisor 建议等话题时
  使用此 skill。
---

# 昇腾 Profiling 性能数据分析与调优

## 1. 分析工作流（Agent 视角）

性能分析的核心目标：**找出占 end-to-end 时间比例最大的算子，分析其 Shape、Cube/Vector 分布，给出优化建议。**

```
采集数据 → 定位 CSV → 算子/迭代/通信分析 → 生成优化建议 → 输出分析报告
```

数据采集请使用 `@ascend-profiling-collect`。本 Skill 专注于分析。

### 核心分析原则

**原则 1：始终以整网占比为标尺**

所有分析结论必须标注**整网占比**（该数据占单 step 端到端时间的百分比）。仅看 CV、绝对耗时等指标会产生误判：

- 算子抖动：CV 高但整网占比低 → 可忽略；CV 低但整网占比高 → 不可忽略
  - 例：MatMulV3 某 shape CV=10.5% 但整网仅 0.2% → 无需关注；FusedInferAttentionScore CV=9.8% 但整网 42.1% → 抖动额外耗时 4.1%，优先处理
- 算子优化：优先优化整网占比大的算子，而非单次耗时最高的算子
- 通信分析：通信总占比、各 shape 通信在整网中的占比
- 抖动影响量化：抖动额外耗时 = std × 次数，折算为整网占比

**原则 2：快慢卡判断看 Comm 占比差异，而非 Stage 总时间**

多卡场景下，Stage 总时间可能非常接近（通信同步会拉平差异），但这并不意味着各卡均衡。正确判断方法：

- 看 `Communication(Not Overlapped)` 占比：慢卡的通信等待占比明显高于快卡
- 快卡特征：Computing 占比高、Comm 占比低 — 算得快，到同步点后等待少
- 慢卡特征：Computing 占比低、Comm 占比高 — 被通信等待拖住
- Comm 占比差异超过 1.5 倍即可判定为快慢卡现象
- 示例：Rank 1 Comm 3.2% vs Rank 3 Comm 6.8% → Rank 3 是慢卡（差 2.1 倍）

### 分析报告输出要求

**分析完成后，必须在 profiling 数据目录下生成 `profiling_report.md` 文件**，而非仅在终端打印结果。

报告文件路径：`<profiling_data_dir>/profiling_report.md`

报告应包含以下章节：

1. **基本信息** — 模型名称、精度、分辨率、并行方式、采集配置等
2. **迭代时间分解** — 各 rank 的 Computing / Communication / Free 占比对比，识别快慢卡（看 Comm 占比差异）
3. **算子耗时分布** — Cube/Vector/AICPU 占比、按 OP Type 汇总 Top-10（标注整网占比）、Top 慢算子详情、PipeUtilization 分析
4. **通信分析** — 通信算子 shape、耗时、抖动（CV）、数据量，标注各通信组的整网占比
5. **算子抖动分析** — 同 shape 算子的 CV 检测，**必须标注该组算子的整网占比和抖动额外耗时的整网占比**，以判断是否值得优化
6. **关键问题与优化建议** — 按 HIGH / MEDIUM / LOW 分级，每条包含问题描述、整网影响占比、优化建议
7. **总结** — 概括性能画像和优化优先级，所有优化项标注整网占比

### 首选分析路径（CLI/脚本，agent 可直接执行）

**Step 1: 一键综合分析（推荐首选）**

```bash
# 自动发现 profiling CSV 文件并生成综合报告
python scripts/analyze_profiling.py -d <profiling_data_dir> -n 30

# JSON 格式输出（便于程序解析）
python scripts/analyze_profiling.py -d <profiling_data_dir> --json
```

报告包含：
- Cube (AI_CORE) / Vector (AI_VECTOR_CORE) / AICPU 耗时占比
- Top-N 慢算子（名称、类型、耗时、占比、累计占比、Input Shapes）
- **PipeUtilization 指标**（Mac/Vec/MTE2 ratio）和 **Bound 分类**（compute/memory/vector）— 仅在采集时开启 `aic_metrics=PipeUtilization` 时可用
- 按 OP Type 分组汇总
- 迭代时间分解（Computing / Communication / Free / Data_aug）
- 通信算子汇总（如有）
- 自动优化建议

**Step 2: 深度算子分析**

```bash
# 完整分析模式（Top-N + 类型分布 + Cube/Vector 比 + 建议）
python scripts/parse_op_summary.py -f <op_summary.csv 或 kernel_details.csv> --analyze

# JSON 格式
python scripts/parse_op_summary.py -f <csv_file> --json

# 只看 AI_CORE 算子
python scripts/parse_op_summary.py -f <csv_file> --filter-type AI_CORE -n 20

# 只看 AI_CPU 算子（应尽量消除）
python scripts/parse_op_summary.py -f <csv_file> --filter-type AI_CPU
```

**JSON 输出关键字段**（`--json` 模式，agent 解析用）：

```
analyze_profiling.py --json 输出:
  op_analysis[].cube_vector.{cube,vector,mix,aicpu}.pct  — Cube/Vector 占比
  op_analysis[].top_ops[].{name,type,duration_us,pct,cumulative_pct,shapes}  — 基本信息
  op_analysis[].top_ops[].{mac_ratio,vec_ratio,mte2_ratio,bound}  — 瓶颈分类
  op_analysis[].suggestions[]  — 优化建议
  step_trace[].breakdown.{Computing,Free,...}.pct  — 迭代分解
  communication[].by_type[].{type,time_us,pct,size_mb,bandwidth_gbps}  — 通信统计
```

**Step 3: 迭代时间分解**

```bash
python scripts/parse_step_trace.py -f <step_trace_time.csv>
python scripts/parse_step_trace.py -f <step_trace_time.csv> --json
```

**Step 4: 通信分析**

```bash
python scripts/parse_comm_stats.py -f <communication_statistic.csv>
python scripts/parse_comm_stats.py -f <communication_statistic.csv> --json
```

**Step 5: msprof-analyze advisor（自动诊断 + 调优建议）**

```bash
# 全面诊断（推荐）
msprof-analyze advisor all -d <profiling_path>

# 仅计算维度
msprof-analyze advisor computation -d <profiling_path>

# 仅调度维度
msprof-analyze advisor schedule -d <profiling_path>
```

### 跨 Skill 联动

遇到不熟悉的性能指标字段，使用 `@ascend-profiling-collect` 查询定义：

```bash
python <collect-skill-path>/scripts/search_metrics.py "Task Duration"
python <collect-skill-path>/scripts/search_metrics.py --list --category
```

---

## 2. Profiling 数据文件定位

profiling 数据解析后产生的 CSV 文件位于 `*_ascend_pt/ASCEND_PROFILER_OUTPUT/` 或 `*_ascend_pt/PROF_*/mindstudio_profiler_output/` 目录下。

### 关键 CSV 文件

| 文件 | 内容 | 用途 |
|------|------|------|
| `kernel_details.csv` | 每个 NPU kernel 的详细信息（CANN 8.5+） | 算子性能分析 |
| `op_summary*.csv` | 每个算子的汇总信息（旧版 CANN） | 算子性能分析 |
| `step_trace_time.csv` | 迭代时间分解 | 瓶颈定位 |
| `communication_statistic*.csv` | 通信算子统计 | 通信分析 |
| `operator_details.csv` | 框架层算子信息 | 算子映射 |
| `operator_memory.csv` | 算子内存分配 | 内存分析 |
| `npu_mem*.csv` | NPU 内存使用 | 峰值内存分析 |

### 查找 CSV 文件

```bash
find <profiling_dir> -name "*.csv" | grep -E "(kernel_details|op_summary|step_trace|communication)"
```

---

## 3. 算子性能分析核心方法

### 分析目标

1. **找出 Top-N 慢算子**：按 `Task Duration(us)` / `Duration(us)` 排序，关注占 end-to-end 比例最大的算子
2. **查看 Input Shapes**：形状是否对齐（16 的倍数）、是否合理
3. **Cube vs Vector 比例**：AI_CORE（MatMul 等 Cube 计算）vs AI_VECTOR_CORE（Elementwise 向量计算）的耗时分布
4. **给出优化建议**：针对具体瓶颈类型

### 关键字段说明

**op_summary / kernel_details 字段：**

| 字段 | 说明 |
|------|------|
| OP Name / Name | 算子全名 |
| OP Type / Type | 算子类型（MatMulV2, Cast, Transpose, LayerNormGrad 等） |
| Task Duration(us) / Duration(us) | 算子执行耗时（核心排序依据） |
| Task Type / Accelerator Core | AI_CORE / AI_VECTOR_CORE / MIX_AIV / MIX_AIC / AI_CPU / DSA_SQE |
| Block Dim | 核数（< 设备最大核数说明并行度不足） |
| Input Shapes | 输入张量形状 |
| aic_mac_ratio | Cube 矩阵计算单元利用率（需 aic_metrics=PipeUtilization） |
| aiv_vec_ratio | Vector 计算单元利用率 |
| aic_mte2_ratio | L2/HBM → L1 搬运利用率 |

### Task Type / Accelerator Core 分类

| 类型 | 说明 | 优化关注点 |
|------|------|-----------|
| AI_CORE | Cube 计算（MatMul 等矩阵运算） | Shape 对齐，利用率 |
| AI_VECTOR_CORE | Vector 计算（Elementwise、LayerNorm、Softmax） | 算子融合，减少 kernel 数 |
| MIX_AIV / MIX_AIC | 混合模式（同时用 Cube 和 Vector） | 查看实际瓶颈侧 |
| AI_CPU | CPU 侧算子（性能差） | 替换为 AI Core 实现 |

### 计算 vs 搬运瓶颈判定

当采集了 `aic_metrics=PipeUtilization` 时：

| 场景 | 特征 | 优化方向 |
|------|------|----------|
| Compute Bound | aic_mac_ratio 高、aic_mte2_ratio 低 | 减少计算量、使用融合算子 |
| Memory Bound | aic_mte2_ratio 高、aic_mac_ratio 低 | 优化数据布局、减少搬运 |
| Under-utilized | 所有 ratio 都低 | Block Dim 不足或下发间隙 |

---

## 4. 迭代时间分解分析

step_trace_time.csv 记录每个 step 的时间分解：

| 字段 | 说明 | 占比高时的优化方向 |
|------|------|--------------------|
| Stage | 总迭代时间 | 基准 |
| Computing | 前向 + 反向计算 | 算子优化、混合精度 |
| Communication(Not Overlapped) | 未被计算重叠的通信 | 通信/计算流水、梯度压缩 |
| Free | 空闲/等待时间 | 下发优化（消除 aclOpCompile、减少流同步） |
| Data_aug Bound | 数据预处理瓶颈 | 增大 num_workers、pin_memory、DVPP |
| Bubble | 流水线气泡（PP 并行） | 调整 micro-batch 数 |

**关键判断规则：**
- `Free` > 15% → 下发瓶颈，检查 `torch_npu.npu.set_compile_mode(jit_compile=False)`
- `Communication(Not Overlapped)` > 30% → 通信瓶颈
- `Data_aug Bound` > 10% → 数据预处理瓶颈

---

## 5. msprof-analyze 命令参考

### 安装

```bash
pip install msprof-analyze
```

### 常用命令

```bash
# 自动诊断 + 调优建议（最常用）
msprof-analyze advisor all -d ./prof_data

# 计算类算子汇总
msprof-analyze -m compute_op_sum -d ./prof_data

# 通信算子汇总（Top-N）
msprof-analyze -m hccl_sum -d ./prof_data --top_num 20

# 集群慢卡识别
msprof-analyze -m slow_rank -d ./cluster_data

# 通信矩阵 + 通信耗时 + step_trace_time
msprof-analyze -m all -d ./cluster_data

# NPU vs GPU 性能对比
msprof-analyze compare -d ./ascend_pt -bp ./gpu_trace.json -o ./compare_output

# 集群数据对比
msprof-analyze -m cluster_time_compare_summary -d ./cluster_data --bp ./baseline_data
```

### 核心参数

| 参数 | 说明 |
|------|------|
| `-d` | 性能数据目录（必选） |
| `-o` | 输出路径 |
| `-m` | 分析能力选项（默认 all） |
| `--rank_list` | 指定 Rank |
| `--step_id` | 指定 Step ID |
| `--top_num` | Top-N 数量（hccl_sum，默认 15） |
| `--bp` | 标杆数据路径 |
| `--force` | 强制执行 |

### 分析能力列表

| 类别 | 命令 | 说明 |
|------|------|------|
| 拆解 | cluster_time_summary | 性能数据细粒度拆解 |
| | cluster_time_compare_summary | 性能数据对比（需 --bp） |
| 计算 | compute_op_sum | 计算类算子汇总 |
| | freq_analysis | AI Core 频率异常检测 |
| 通信 | hccl_sum | 通信算子汇总 |
| | communication_matrix | 通信矩阵分析 |
| | communication_time | 通信耗时分析 |
| | slow_rank | 慢卡识别 |
| | pp_chart | PP 流水图 |
| Host | cann_api_sum | CANN 层 API 汇总 |

### CANN 版本兼容

- **≥ 8.2.0a1**：`msprof-analyze -m <feature>`
- **< 8.2.0a1**：`msprof-analyze cluster -m <feature>`

```bash
msprof-analyze --version
```

> 详细参数说明见 `references/msprof-analyze-detail.md`

---

## 6. 常见调优模式

| 瓶颈类型 | 诊断方法 | 常见优化 |
|----------|----------|----------|
| 算子慢 | `parse_op_summary.py --analyze` / advisor computation | 融合算子、亲和 API、消除 AICPU |
| 下发慢 | step_trace Free 占比 / advisor schedule | 消除 aclOpCompile、减少流同步 |
| 通信慢 | hccl_sum / advisor communication | 梯度压缩、通信重叠、字节对齐 |
| 内存不足 | npu_mem / advisor memory | 重计算、混合精度、模型并行 |
| 数据瓶颈 | step_trace Data_aug / advisor dataloader | num_workers、DVPP、prefetch |
| 集群慢卡 | slow_rank / advisor overall | 硬件检查、负载均衡 |

### 常见优化操作

```python
# 消除 aclOpCompile（下发优化）
torch_npu.npu.set_compile_mode(jit_compile=False)
torch_npu.npu.config.allow_internal_format = False

# GC 优化
import gc
gc.set_threshold(0)  # 或 gc.disable()
```

```bash
# 环境变量
export ACLNN_CACHE_LIMIT=10000
export HOST_CACHE_CAPACITY=20
```

### Advisor 报告解读

advisor 输出 html + xlsx 报告，终端也会打印关键建议。report 分三级：
- 红色 (High)：高优先级问题，必须解决
- 黄色 (Medium)：中等优先级，建议解决
- 绿色 (Low)：低优先级，可选优化

> 详细 advisor 参考见 `references/advisor-detail.md`

---

## 7. 人工可视化工具（供用户参考）

以下工具需要 GUI 操作，agent 无法直接使用，但可以告知用户：

- **Perfetto UI** (https://ui.perfetto.dev/)：加载 `trace_view.json` 查看 Timeline
- **MindStudio Insight**：打开 `.db` 文件查看多维度分析视图
- **TensorBoard**：`pip install torch-tb-profiler-ascend && tensorboard --logdir=./result`

> 详细工具使用见 `references/visualization-tools-detail.md`

---

## 8. Playbook 搜索

```bash
python scripts/search_playbooks.py --list --category
python scripts/search_playbooks.py "算子"
python scripts/search_playbooks.py "通信"
```

> 详细分析场景见 `assets/` 目录下的分类 playbook。
