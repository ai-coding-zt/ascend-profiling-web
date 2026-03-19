---
name: ascend-prof-collect
description: |
  华为昇腾AI处理器性能数据采集、解析与分析指南。覆盖 PyTorch Profiler（torch_npu.profiler）
  和 msprof 命令行两种采集方式，包含性能数据文件格式参考和可视化工具使用。当用户提到
  Ascend profiling、性能采集、msprof、torch_npu.profiler、NPU 性能分析、算子耗时、
  通信带宽分析等话题时使用此 skill。
---

# 昇腾 Profiling 性能数据采集与分析

## 1. 总览与工作流

昇腾性能分析分为四个阶段：

```
配置采集参数 → 执行采集 → 解析/导出 → 可视化查看
```

### 两种采集方式对比

| 维度 | PyTorch Profiler (torch_npu.profiler) | msprof 命令行 |
|------|---------------------------------------|---------------|
| 适用场景 | PyTorch 训练/推理脚本 | 任意 AI 任务（C++/Python/Shell） |
| 接入方式 | 修改 Python 代码，添加 profiler 上下文 | 在命令前加 `msprof` 前缀 |
| 框架数据 | 可采集 PyTorch 框架层算子信息 | 不支持 PyTorch/MindSpore 框架层 |
| 灵活性 | 支持 schedule 控制 step、dynamic_profile | 支持动态采集、延迟采集 |
| 输出格式 | 自动解析为 json/csv/db | 自动解析为 json/csv/db |

**选择建议**：PyTorch 用户优先使用 `torch_npu.profiler`；非 PyTorch 场景或需要纯系统级数据时用 `msprof`。

---

## 2. PyTorch Profiler 快速入门

### 最小示例

```python
import torch
import torch_npu

experimental_config = torch_npu.profiler._ExperimentalConfig(
    export_type=[torch_npu.profiler.ExportType.Text],
    profiler_level=torch_npu.profiler.ProfilerLevel.Level0,
    data_simplification=False,
)

with torch_npu.profiler.profile(
    activities=[
        torch_npu.profiler.ProfilerActivity.CPU,
        torch_npu.profiler.ProfilerActivity.NPU,
    ],
    schedule=torch_npu.profiler.schedule(wait=0, warmup=0, active=1, repeat=1, skip_first=1),
    on_trace_ready=torch_npu.profiler.tensorboard_trace_handler("./result"),
    record_shapes=False,
    profile_memory=False,
    with_stack=False,
    experimental_config=experimental_config,
) as prof:
    for step in range(steps):
        train_one_step(step, steps, train_loader, model, optimizer, criterion)
        prof.step()
```

### 核心参数速查

#### profile() 基础参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `activities` | List[Enum] | [CPU, NPU] | 采集目标：CPU 框架层 / NPU 设备层 |
| `schedule` | Callable | None | 控制不同 step 的采集行为 |
| `on_trace_ready` | Callable | None | 采集完成后的处理函数，通常用 `tensorboard_trace_handler` |
| `record_shapes` | bool | False | 记录算子 InputShapes/InputTypes |
| `profile_memory` | bool | False | 记录显存占用 |
| `with_stack` | bool | False | 记录 Python 调用栈（有性能开销） |
| `with_modules` | bool | False | 记录 modules 层级调用信息（有性能开销） |

#### schedule() 参数

| 参数 | 说明 |
|------|------|
| `skip_first` | 采集前跳过的 step 数（动态 Shape 建议 ≥10） |
| `wait` | 每轮重复中跳过的 step 数 |
| `warmup` | 预热 step 数（建议 ≥1） |
| `active` | 实际采集的 step 数 |
| `repeat` | 重复次数（建议 =1，避免多份数据混淆） |

公式：`step总数 >= skip_first + (wait + warmup + active) * repeat`

#### experimental_config 关键参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `export_type` | [Text] | 输出格式：Text (json+csv+db) / Db (仅 db) |
| `profiler_level` | Level0 | Level_none / Level0 / Level1 / Level2，级别越高数据越全 |
| `aic_metrics` | AiCoreNone | AI Core 性能指标：PipeUtilization / ArithmeticUtilization / Memory 等 |
| `l2_cache` | False | L2 Cache 命中率采集 |
| `mstx` | False | 自定义打点功能 |
| `data_simplification` | True | 数据精简模式，导出后删除多余原始数据 |
| `gc_detect_threshold` | None | GC 检测阈值(ms)，推荐设为 1 |
| `host_sys` | [] | Host 侧数据：CPU/MEM/DISK/NETWORK/OSRT |
| `sys_io` | False | NIC/ROCE/MAC 网络 I/O 采集 |
| `sys_interconnection` | False | HCCS/PCIe/片间传输带宽采集 |

### profiler_level 级别对比

| 级别 | 采集内容 |
|------|----------|
| Level_none | 关闭所有 Level 控制的数据 |
| Level0 | 上层应用 + NPU 算子信息（部分） |
| Level1 | Level0 + AscendCL + AI Core PMU + 通信 json + api_statistic |
| Level2 | Level1 + Runtime + AICPU 数据 |

### dynamic_profile 动态采集

无需预先确定采集时机，训练过程中随时启动：

```python
from torch_npu.profiler import dynamic_profile as dp

dp.init("profiler_config_path")  # 自动创建 profiler_config.json 模板
for step in steps:
    train_one_step()
    dp.step()
```

然后在另一个终端修改 `profiler_config.json` 中的 `start_step` 即可触发采集。

> 详细参数说明见 `references/pytorch-profiler-detail.md`

---

## 3. msprof 命令行快速入门

### 基本命令

```bash
msprof [options] <app>           # 推荐：直接在末尾传入用户程序
msprof [options] --application=<app>  # 方式二
```

### 常用场景一行命令

```bash
# 采集AI任务全部数据（默认配置）
msprof --output=./profiling_data python3 train.py

# 采集算子耗时（最小开销）
msprof --output=./profiling_data --task-time=l0 python3 train.py

# 采集算子 + 通信 + 系统数据
msprof --output=./profiling_data --task-time=on --sys-hardware-mem=on \
       --sys-interconnection-profiling=on python3 train.py

# 采集 Host 侧 CPU/内存
msprof --output=./profiling_data --host-sys=cpu,mem python3 train.py

# 延迟 10s 后采集 5s
msprof --output=./profiling_data --delay=10 --duration=5 python3 train.py

# 动态采集（交互模式）
msprof --dynamic=on --output=./profiling_data python3 train.py
# 在交互界面输入: start → ... → stop → quit
```

### 核心参数速查

#### AI 任务采集参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--output` | 当前目录 | 性能数据存放路径 |
| `--type` | text | 解析格式：text (json+csv+db) / db (仅 db) |
| `--task-time` | on | 算子耗时：off / l0（轻量）/ l1（详细）/ on（=l1） |
| `--ascendcl` | on | AscendCL 接口数据 |
| `--runtime-api` | off | Runtime API 数据 |
| `--aicpu` | off | AICPU 算子详细耗时 |
| `--ai-core` | 跟随 task-time | AI Core 硬件数据 |
| `--aic-metrics` | PipeUtilization | AI Core 指标项 |
| `--sys-hardware-mem` | off | 片上内存/LLC/AccPMU/SoC 带宽 |
| `--l2` | off | L2 Cache 命中率 |
| `--task-memory` | off | CANN 算子级内存占用 |

#### 系统数据采集参数

| 参数 | 说明 |
|------|------|
| `--sys-devices` | 设备 ID（all 或逗号分隔） |
| `--sys-period` | 采样时长(s) |
| `--sys-profiling` | CPU usage + System memory |
| `--sys-pid-profiling` | 进程级 CPU/memory |
| `--sys-cpu-profiling` | AICPU/CtrlCPU/TSCPU 数据 |
| `--sys-io-profiling` | NIC/ROCE/MAC 网络数据 |
| `--sys-interconnection-profiling` | HCCS/PCIe/片间传输 |
| `--dvpp-profiling` | DVPP 数据 |

#### Host 侧采集参数

| 参数 | 说明 |
|------|------|
| `--host-sys` | cpu,mem,disk,network,osrt（逗号分隔） |
| `--host-sys-usage` | 系统+所有进程的 cpu,mem |
| `--host-sys-pid` | 指定进程 PID |

> 详细参数说明见 `references/msprof-collect-detail.md`

---

## 4. 解析与导出

### msprof 离线解析导出

```bash
# 解析原始数据
msprof --parse=on --output=./PROF_XXX

# 解析并导出（常用）
msprof --export=on --output=./PROF_XXX [--type=text]

# 导出指定迭代
msprof --export=on --output=./PROF_XXX --model-id=1 --iteration-id=2

# 查询性能数据信息（Model ID / Iteration ID）
msprof --query=on --output=./PROF_XXX
```

### PyTorch 离线解析

当采集数据量大、不适合在线解析时：

```python
from torch_npu.profiler.profiler import analyse

analyse(
    profiler_path="./result_data",
    max_process_number=4,           # 可选，默认 CPU 核数/2
    export_type=["text"],           # 可选：["text"] / ["db"]
)
```

### 导出参数速查

| 参数 | 说明 |
|------|------|
| `--export=on` | 启用导出 |
| `--output` | PROF_XXX 目录或其父目录 |
| `--type` | text (json+csv+db) / db (仅 db) |
| `--iteration-id` | 指定迭代 ID（需配合 --model-id） |
| `--model-id` | 指定模型 ID |
| `--summary-format` | csv / json |
| `--clear=on` | 导出后删除中间 sqlite 文件 |

> 详细参数说明见 `references/msprof-parse-detail.md`

---

## 5. 输出目录与文件概览

### PyTorch Profiler 输出目录

```
result/
└── {worker_name}_{pid}_{timestamp}_ascend_pt/
    ├── profiler_info.json
    ├── profiler_metadata.json
    ├── ASCEND_PROFILER_OUTPUT/         # 解析后的性能数据
    │   ├── trace_view.json            # timeline 数据（Perfetto UI 查看）
    │   ├── operator_details.csv       # 算子详细信息（CANN 8.5+）
    │   ├── kernel_details.csv         # Kernel 详细信息（CANN 8.5+）
    │   ├── step_trace_time.csv        # 迭代轨迹信息（CANN 8.5+）
    │   ├── ascend_pytorch_profiler.db # 综合 db 文件（MindStudio Insight 查看）
    │   ├── analysis.db                # 分析 db 文件
    │   └── ...                        # 其他 csv/json（通信、内存等按采集配置生成）
    ├── FRAMEWORK/                     # PyTorch 框架层原始数据
    │   ├── torch.op_mark
    │   └── torch.op_range
    └── PROF_XXX/                      # CANN 层原始性能数据
```

### msprof 输出目录

```
output/
└── PROF_XXX/
    ├── device_0/data/                 # Device 侧原始数据
    ├── host/data/                     # Host 侧原始数据
    ├── msprof_*.db                    # 综合 db 文件
    └── mindstudio_profiler_output/    # 解析后的性能数据
        ├── msprof_*.json              # timeline
        ├── op_summary_*.csv           # 算子详细信息
        ├── step_trace_*.json          # 迭代轨迹
        ├── xx_*.csv                   # 各类 summary
        └── README.txt
```

### text vs db 格式

| 格式 | 输出文件 | 查看方式 |
|------|----------|----------|
| text | json + csv + db | Perfetto UI (json)、Excel (csv)、MindStudio Insight (db) |
| db | 仅 db | MindStudio Insight |

---

## 6. 性能指标分类概览与搜索

性能数据解析后会生成多种 csv/json 文件，每种对应一类性能指标。原始文档共 52 个指标说明文件，按以下分类组织：

### 分类概览

#### (A) 算子与调度
| 指标文件 | 说明 |
|----------|------|
| op_summary | 算子详细信息（名称、耗时、Shape、AI Core 指标等） |
| op_statistic | 算子调用次数及耗时统计 |
| task_time | 任务调度信息（下发耗时、执行耗时） |
| step_trace | 迭代轨迹信息（计算/通信/空闲时间占比） |
| api_statistic | API 耗时统计（AscendCL/Runtime 接口） |
| fusion_op | 算子融合信息 |
| aicpu | AICPU 算子详细耗时 |
| aicpu_mi | 数据准备的队列 |
| dp | 数据增强信息 |
| dvpp | DVPP 信息 |
| os_runtime_statistic | Host 侧 syscall 和 pthreadcall |

#### (B) 内存
| 指标文件 | 说明 |
|----------|------|
| npu_mem | NPU 内存占用 |
| npu_module_mem | NPU 组件内存占用 |
| memory_record | CANN 算子的内存占用记录 |
| operator_memory | CANN 算子的内存占用明细 |
| static_op_mem | 静态图算子内存 |
| process_mem | 进程内存占用 |
| sys_mem | 系统内存数据 |
| host_mem_usage | Host 侧内存利用率 |
| 片上内存读写速率 | HBM/DDR 读写速率 |

#### (C) 通信
| 指标文件 | 说明 |
|----------|------|
| communication_statistic | 集合通信算子统计信息 |
| hccs | 集合通信带宽（HCCS） |
| pcie | PCIe 带宽 |
| nic | 网络信息（每个时间节点） |
| roce | RoCE 通信接口带宽 |
| StarsChipTrans | 片间传输带宽信息 |
| StarsSocInfo | SoC 传输带宽信息 |

#### (D) 系统与 Host
| 指标文件 | 说明 |
|----------|------|
| cpu_usage | AICPU/CtrlCPU 利用率 |
| host_cpu_usage | Host 侧 CPU 利用率 |
| host_disk_usage | Host 侧磁盘 I/O 利用率 |
| host_network_usage | Host 侧网络 I/O 利用率 |
| process_cpu_usage | 进程 CPU 占用率 |
| msproftx | 自定义打点数据 |

#### (E) 硬件 PMU 与缓存
| 指标文件 | 说明 |
|----------|------|
| ai_core_utilization | AI Core 指令占比 |
| ai_vector_core_utilization | AI Vector Core 指令占比 |
| biu_group/aic_core_group/aiv_core_group | AI Core 和 AI Vector 的带宽和延时 |
| AccPMU | 加速器带宽及并发信息 |
| l2_cache | L2 Cache 命中率 |
| llc_read_write | 三级缓存读写速率 |
| pmu_events | PMU 事件（ai_cpu/ctrl_cpu/ts_cpu） |
| top_function | 热点函数（ai_cpu/ctrl_cpu/ts_cpu） |

#### (F) 综合数据
| 指标文件 | 说明 |
|----------|------|
| 总体说明 | 性能数据文件总体说明 |
| msprof(timeline数据总表) | timeline json 格式说明 |
| msprof导出db格式数据说明 | db 文件表结构说明 |

### 搜索指标详细信息

使用 `scripts/search_metrics.py` 脚本搜索具体指标的字段定义：

```bash
# 列出所有指标文件
python scripts/search_metrics.py --list

# 按分类列出
python scripts/search_metrics.py --list --category

# 搜索具体字段或关键字
python scripts/search_metrics.py "Task Duration"
python scripts/search_metrics.py "内存"
python scripts/search_metrics.py "op_summary"
```

脚本会返回匹配的文件路径和上下文，之后用 Read 工具读取具体文件获取完整字段定义。

指标文档位于：`assets/` 目录（相对于 skill 根目录）

---

## 7. 查看与分析工具

### Perfetto UI
- 打开 https://ui.perfetto.dev/
- 加载 `trace_view.json` 或 `msprof_*.json` 文件
- 支持 timeline 视图、搜索、筛选

### MindStudio Insight
- 打开 `.db` 文件（ascend_pytorch_profiler_*.db 或 msprof_*.db）
- 提供算子统计、通信分析、内存分析等专业视图
- 下载地址：https://www.hiascend.com/software/mindstudio

### Excel / CSV 查看
- 直接用 Excel 或 Python pandas 打开 `*.csv` 文件
- 注意：csv 文件可能包含中文字段名，确保 UTF-8 编码打开

### msprof-analyze 工具
- 开源性能分析辅助工具：https://gitcode.com/Ascend/mstt/tree/master/profiler/msprof_analyze

---

## 8. 常见问题与最佳实践

### 磁盘空间
- 性能数据可能占用大量磁盘，务必确保目标目录有足够空间
- 使用 `data_simplification=True`（PyTorch）或 `--clear=on`（msprof）减少存储
- 控制 `active` step 数，避免采集过多迭代

### 多进程/多卡场景
- PyTorch: 每张卡一个采集进程，数据自动按 Rank 分目录
- msprof: 多卡场景每个进程生成独立 PROF_XXX 目录
- dynamic_profile 建议配合共享存储使用

### 采集开销控制
- `profiler_level=Level0` + `task-time=l0` 为最低开销配置
- 避免同时开启 `with_stack`、`record_shapes`、`profile_memory` 等多个开关
- 生产环境建议使用 dynamic_profile 或 msprof --delay 按需采集

### 常见错误排查
- 采集后无数据：检查 `on_trace_ready` 是否配置、`schedule` 的 step 范围是否覆盖实际训练
- db 导出失败：确认安装了支持 db 格式的 CANN Toolkit 和 ops 算子包
- glibc Bug：采集 memory 数据时若出错，升级 glibc 到 ≥2.34
