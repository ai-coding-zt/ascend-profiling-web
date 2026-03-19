# Ascend PyTorch Profiler 接口参考

Ascend PyTorch Profiler 是针对 PyTorch 框架开发的性能分析工具，通过在训练/推理脚本中添加接口，采集 PyTorch 层算子、CANN 层算子、NPU 算子及内存占用等性能数据。

---

## 1. torch_npu.profiler.profile 接口

### 1.1 接口原型

```python
torch_npu.profiler.profile(
    activities=None,
    schedule=None,
    on_trace_ready=None,
    record_shapes=False,
    profile_memory=False,
    with_stack=False,
    with_modules=False,
    with_flops=False,
    experimental_config=None
)
```

### 1.2 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| activities | List[Enum] | [CPU, NPU] | CPU/NPU事件采集列表。`ProfilerActivity.CPU` 采集框架侧数据，`ProfilerActivity.NPU` 采集CANN及NPU数据 |
| schedule | Callable | None | 设置不同step的行为，由 `torch_npu.profiler.schedule` 类控制 |
| on_trace_ready | Callable | None | 采集结束时自动执行操作，通常配置 `tensorboard_trace_handler` |
| record_shapes | bool | False | 采集算子的 InputShapes 和 InputTypes，需开启 CPU activity |
| profile_memory | bool | False | 采集算子显存占用情况。CPU activity 采集框架显存，NPU activity 采集CANN显存 |
| with_stack | bool | False | 采集算子调用栈（框架层及CPU算子层），需开启 CPU activity。会引入额外性能膨胀 |
| with_modules | bool | False | 采集 modules 层级的 Python 调用栈（框架层调用信息），需开启 CPU activity |
| with_flops | bool | False | 采集算子浮点操作（该参数暂不支持解析性能数据） |
| experimental_config | _ExperimentalConfig | None | 性能数据采集扩展配置，详见第2节 |

### 1.3 主要方法

| 方法 | 说明 |
|------|------|
| `step()` | 划分不同迭代，与 schedule 配套使用 |
| `start()` / `stop()` | 手动控制采集起止位置 |
| `export_chrome_trace(path)` | 导出 trace 数据到 .json 文件 |
| `export_stacks(path, metric)` | 导出堆栈信息，metric 可选 `self_cpu_time_total` 或 `self_npu_time_total` |
| `export_memory_timeline(output_path, device)` | 导出显存时间线可视化文件（.html / .json） |
| `add_metadata(key, value)` | 添加自定义字符串标记到 profiler_metadata.json |

### 1.4 使用示例

**方式一：with 语句（推荐）**

```python
import torch
import torch_npu

experimental_config = torch_npu.profiler._ExperimentalConfig(
    profiler_level=torch_npu.profiler.ProfilerLevel.Level1,
    aic_metrics=torch_npu.profiler.AiCMetrics.PipeUtilization,
    l2_cache=False,
    data_simplification=False
)

with torch_npu.profiler.profile(
    activities=[
        torch_npu.profiler.ProfilerActivity.CPU,
        torch_npu.profiler.ProfilerActivity.NPU
    ],
    schedule=torch_npu.profiler.schedule(wait=1, warmup=1, active=2, repeat=2, skip_first=10),
    on_trace_ready=torch_npu.profiler.tensorboard_trace_handler("./result"),
    record_shapes=True,
    profile_memory=True,
    with_stack=True,
    experimental_config=experimental_config
) as prof:
    for step in range(steps):
        train_one_step(step, steps, train_loader, model, optimizer, criterion)
        prof.step()
```

**方式二：start/stop 手动控制**

```python
prof = torch_npu.profiler.profile(
    on_trace_ready=torch_npu.profiler.tensorboard_trace_handler("./result")
)
prof.start()
for step in range(steps):
    train_one_step()
    prof.step()
prof.stop()
```

---

## 2. _ExperimentalConfig 扩展配置

### 2.1 接口原型

```python
torch_npu.profiler._ExperimentalConfig(
    export_type=[torch_npu.profiler.ExportType.Text],
    profiler_level=torch_npu.profiler.ProfilerLevel.Level0,
    mstx=False,
    mstx_domain_include=[],
    mstx_domain_exclude=[],
    aic_metrics=torch_npu.profiler.AiCMetrics.AiCoreNone,
    l2_cache=False,
    op_attr=False,
    data_simplification=False,
    record_op_args=False,
    gc_detect_threshold=None,
    host_sys=[],
    sys_io=False,
    sys_interconnection=False
)
```

### 2.2 参数详细说明

#### export_type — 导出格式

| 取值 | 说明 |
|------|------|
| `ExportType.Text`（默认） | 解析为 .json / .csv 格式的 timeline 和 summary 文件，以及 .db 文件 |
| `ExportType.Db` | 仅解析为 .db 格式文件（ascend_pytorch_profiler_{Rank_ID}.db、analysis.db），使用 MindStudio Insight 查看 |

可同时配置：`export_type=[ExportType.Text, ExportType.Db]`

#### profiler_level — 采集等级

| 取值 | 说明 |
|------|------|
| `ProfilerLevel.Level_none` | 不采集 Level 层级控制的数据，关闭 profiler_level |
| `ProfilerLevel.Level0`（默认） | 采集上层应用数据、底层NPU数据及算子信息 |
| `ProfilerLevel.Level1` | Level0 + CANN层AscendCL数据 + AI Core性能指标 + 通信数据（communication.json, communication_matrix.json, api_statistic.csv） |
| `ProfilerLevel.Level2` | Level1 + CANN层Runtime数据 + AI CPU数据（data_preprocess.csv） |

#### mstx — 自定义打点

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| mstx | bool | False | 打点控制开关（原参数名 `msprof_tx`，新版本兼容） |
| mstx_domain_include | List[str] | [] | 只输出指定 domain 的打点数据 |
| mstx_domain_exclude | List[str] | [] | 过滤不需要的 domain 数据 |

`mstx_domain_include` 与 `mstx_domain_exclude` 互斥，同时配置时只有 include 生效。

#### aic_metrics — AI Core 性能指标

| 取值 | 说明 |
|------|------|
| `AiCMetrics.AiCoreNone` | 关闭 AI Core 性能指标采集（Level0/Level_none 默认） |
| `AiCMetrics.PipeUtilization` | 计算单元和搬运单元耗时占比（Level1/Level2 默认） |
| `AiCMetrics.ArithmeticUtilization` | 各种计算类指标占比统计 |
| `AiCMetrics.Memory` | 外部内存读写类指令占比 |
| `AiCMetrics.MemoryL0` | 内部 L0 内存读写类指令占比 |
| `AiCMetrics.MemoryUB` | 内部 UB 内存读写指令占比 |
| `AiCMetrics.ResourceConflictRatio` | 流水线队列类指令占比 |
| `AiCMetrics.L2Cache` | 读写 cache 命中次数和缺失后重新分配次数 |
| `AiCMetrics.MemoryAccess` | 算子在核上访存的带宽数据量 |

采集结果在 Kernel View 中呈现。

#### 其他开关参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| l2_cache | bool | False | L2 Cache 数据采集，生成 l2_cache.csv |
| op_attr | bool | False | 采集 aclnn 算子属性信息，仅 Db 格式生效，Level_none 时不生效 |
| data_simplification | bool | True | 数据精简模式，删除多余数据仅保留核心目录以节省存储空间 |
| record_op_args | bool | False | 算子信息统计（AOE调优场景使用），不建议与其他采集同时开启 |
| gc_detect_threshold | float/None | None | GC检测阈值（ms），设为数字开启，推荐1ms。0表示采集所有GC事件 |

#### host_sys — Host 侧系统数据采集

| 取值 | 说明 |
|------|------|
| `HostSystem.CPU` | 进程级别 CPU 利用率 |
| `HostSystem.MEM` | 进程级别内存利用率 |
| `HostSystem.DISK` | 进程级别磁盘 I/O 利用率（需安装 iotop） |
| `HostSystem.NETWORK` | 系统级别网络 I/O 利用率 |
| `HostSystem.OSRT` | 进程级别 syscall 和 pthreadcall（需安装 perf 和 ltrace） |

配置示例：`host_sys=[torch_npu.profiler.HostSystem.CPU, torch_npu.profiler.HostSystem.MEM]`

#### 系统互联采集

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| sys_io | bool | False | NIC、ROCE、MAC 采集 |
| sys_interconnection | bool | False | 集合通信带宽（HCCS）、PCIe 数据、片间传输带宽采集 |

---

## 3. torch_npu.profiler.schedule 类

### 3.1 接口原型

```python
torch_npu.profiler.schedule(wait, active, warmup=0, repeat=0, skip_first=0)
```

### 3.2 参数说明

| 参数 | 类型 | 必选 | 默认值 | 说明 |
|------|------|------|--------|------|
| wait | int | 是 | - | 每次重复执行采集跳过的 step 轮数 |
| active | int | 是 | - | 采集的 step 轮数 |
| warmup | int | 否 | 0 | 预热的 step 轮数，建议设置 1 轮 |
| repeat | int | 否 | 0 | 重复执行 (wait+warmup+active) 的次数。0 表示不停止 |
| skip_first | int | 否 | 0 | 采集前先跳过的 step 轮数。动态 Shape 场景建议 10 |

### 3.3 配置公式

```
step总数 >= skip_first + (wait + warmup + active) * repeat
```

### 3.4 执行流程

```
|<- skip_first ->|<- wait ->|<- warmup ->|<- active ->|<- wait ->|<- warmup ->|<- active ->|
                 |<------------- repeat=1 ------------>|<------------- repeat=2 ------------>|
                                           ^                                     ^
                                     on_trace_ready                         on_trace_ready
```

- skip_first 阶段：跳过前 N 个 step，不做任何操作
- wait 阶段：ProfilerAction.NONE，无任何行为
- warmup 阶段：ProfilerAction.WARMUP，性能数据采集预热
- active 阶段：ProfilerAction.RECORD，最后一个 active step 触发 RECORD_AND_SAVE 并调用 on_trace_ready

### 3.5 配置建议

- `repeat=1` 时生成一份性能数据，适合集群分析工具和 MindStudio Insight
- `repeat>1` 会在同一目录下生成多份性能数据，需手动按时间戳分类
- `repeat=0` 时重复次数由总 step 数决定：repeat = (总step - skip_first) / (wait + warmup + active)

### 3.6 示例

```python
# 跳过1个step，等待1个step，预热1个step，采集2个step，重复2次
# 需要 step总数 >= 1 + (1+1+2)*2 = 9
schedule=torch_npu.profiler.schedule(wait=1, warmup=1, active=2, repeat=2, skip_first=1)
```

---

## 4. tensorboard_trace_handler

### 4.1 接口原型

```python
torch_npu.profiler.tensorboard_trace_handler(dir_name, worker_name=None, analyse_flag=True, async_mode=False)
```

### 4.2 参数说明

| 参数 | 类型 | 必选 | 默认值 | 说明 |
|------|------|------|--------|------|
| dir_name | str | 否 | 当前目录 | 性能数据存放路径，不支持软链接 |
| worker_name | str | 否 | {hostname}_{pid} | 区分唯一工作线程，用于结果目录命名 |
| analyse_flag | bool | 否 | True | 性能数据自动解析开关。False 时需使用离线解析 |
| async_mode | bool | 否 | False | 异步解析开关。True 表示解析进程不阻塞 AI 任务主流程 |

### 4.3 输出目录结构

```
result/
└── {worker_name}_{时间戳}_ascend_pt/
    ├── profiler_info.json                       # Profiler 元数据
    ├── ASCEND_PROFILER_OUTPUT/                   # 解析结果数据
    │   ├── trace_view.json                      # Trace 视图数据
    │   ├── kernel_details.csv                   # NPU 算子详细信息
    │   ├── operator_details.csv                 # PyTorch 算子统计
    │   ├── operator_memory.csv                  # 算子内存占用
    │   ├── memory_record.csv                    # 内存记录
    │   ├── step_trace_time.csv                  # 迭代计算/通信时间统计
    │   ├── communication.json                   # 通信分析（Level1+）
    │   ├── communication_matrix.json            # 通信矩阵（Level1+）
    │   ├── data_preprocess.csv                  # AI CPU 数据（Level2）
    │   └── l2_cache.csv                         # L2 Cache（需开启）
    ├── FRAMEWORK/                               # 框架侧原始数据
    └── PROF_XXXXXX_{时间戳}_{字符串}/             # CANN 层性能数据
        ├── device_x/
        ├── host/
        └── mindstudio_profiler_output/
```

---

## 5. dynamic_profile 动态采集

支持在训练过程中随时启动采集，无需重启训练任务。

### 5.1 三种使用方式

#### 方式一：环境变量方式（仅训练场景，无需修改代码）

```bash
export PROF_CONFIG_PATH="/path/to/profiler_config_path"
```

启动训练后，dynamic_profile 在指定路径下自动创建 `profiler_config.json` 模板文件。
在另一个终端窗口修改该文件即可触发采集。

约束：不支持采集第一个 step（step0），依赖原生 `Optimizer.step()` 划分 step。

#### 方式二：dp.init() + dp.step()（训练/推理场景）

```python
from torch_npu.profiler import dynamic_profile as dp

dp.init("profiler_config_path")
...
for step in steps:
    train_one_step()
    dp.step()
```

`dp.init()` 会在指定路径下自动创建 `profiler_config.json` 模板文件。

#### 方式三：dp.start()（自定义采集位置）

```python
from torch_npu.profiler import dynamic_profile as dp

dp.init("profiler_config_path")
...
for step in steps:
    if step == 5:
        dp.start("/path/to/start_config_path/profiler_config.json")
    train_one_step()
    dp.step()
```

`dp.start()` 在训练运行到指定位置时自动按配置文件执行一次采集。

### 5.2 profiler_config.json 文件格式

```json
{
    "activities": ["CPU", "NPU"],
    "prof_dir": "./",
    "analyse": false,
    "record_shapes": false,
    "profile_memory": false,
    "with_stack": false,
    "with_flops": false,
    "with_modules": false,
    "active": 1,
    "warmup": 0,
    "start_step": 0,
    "is_rank": false,
    "rank_list": [],
    "async_mode": false,
    "experimental_config": {
        "profiler_level": "Level0",
        "aic_metrics": "AiCoreNone",
        "l2_cache": false,
        "op_attr": false,
        "gc_detect_threshold": null,
        "data_simplification": true,
        "record_op_args": false,
        "export_type": ["text"],
        "mstx": false,
        "mstx_domain_include": [],
        "mstx_domain_exclude": [],
        "host_sys": [],
        "sys_io": false,
        "sys_interconnection": false
    }
}
```

### 5.3 profiler_config.json 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| start_step | int | 0 | 开始采集的 step。0=不采集，-1=下个step启动，正整数=指定step启动。**必须首先配置** |
| activities | List[str] | ["CPU","NPU"] | 采集事件列表 |
| prof_dir | str | "./" | 性能数据存放路径 |
| analyse | bool | false | 自动解析开关 |
| record_shapes | bool | false | 算子 InputShapes/InputTypes |
| profile_memory | bool | false | 显存占用 |
| with_stack | bool | false | 算子调用栈 |
| with_flops | bool | false | 算子浮点操作 |
| with_modules | bool | false | modules 层级调用栈 |
| active | int | 1 | 采集迭代数 |
| warmup | int | 0 | 预热 step 轮数，建议设置 1 |
| is_rank | bool | false | 指定 Rank 采集功能开关。开启后 analyse 自动解析不生效 |
| rank_list | List[int] | [] | 采集的 Rank ID 列表，如 [1,2,3] |
| async_mode | bool | false | 异步解析开关 |
| experimental_config | dict | - | 扩展参数，取值为实际参数值（如 `"aic_metrics": "PipeUtilization"`） |

### 5.4 动态采集机制

- dynamic_profile 每 2s 轮询一次 profiler_config.json，发现修改则启动采集
- 启动后记录相邻 step 间隔，将此时间作为新的轮询时间（最小1s）
- 采集期间若文件再次修改，在当前采集结束后再启动新的采集
- `start_step` 必须大于当前已执行到的 step

---

## 6. 离线解析（analyse 函数）

当采集的性能数据较大，不适合在线自动解析时，可使用离线解析。

### 6.1 接口原型

```python
from torch_npu.profiler.profiler import analyse

analyse(profiler_path, max_process_number=None, export_type=None)
```

### 6.2 参数说明

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| profiler_path | str | 是 | 性能数据目录路径，包含 `{worker_name}_{时间戳}_ascend_pt` 目录 |
| max_process_number | int | 否 | 最大解析进程数，用于多 profiling 数据并行解析 |
| export_type | ExportType | 否 | 导出格式，可选 `ExportType.Text` 或 `ExportType.Db` |

### 6.3 使用示例

```python
from torch_npu.profiler.profiler import analyse

if __name__ == "__main__":
    analyse("./")  # 解析当前目录下的性能数据
```

```bash
python3 offline_analyse.py
```

---

## 7. 可选功能简介

### 7.1 mstx 自定义打点

用于大集群场景下快速定界性能问题，自定义采集关键函数的起止时间。

```python
# Host 侧打点
id = torch_npu.npu.mstx.range_start("dataloader", None)
dataloader()
torch_npu.npu.mstx.range_end(id)

# Device 侧打点（需传入 stream）
stream = torch_npu.npu.current_stream()
id = torch_npu.npu.mstx.range_start("matmul", stream)
torch.matmul(a, b)
torch_npu.npu.mstx.range_end(id)

# mark 打点
torch_npu.npu.mstx.mark("forward_start")

# 指定 domain
torch_npu.npu.mstx.mark("event", domain="my_domain")
```

mstx 默认自动采集通信算子、dataloader 耗时、save_checkpoint 接口耗时。

配合 profiler 使用时需设置：
```python
experimental_config = torch_npu.profiler._ExperimentalConfig(
    mstx=True,
    profiler_level=torch_npu.profiler.ProfilerLevel.Level_none,  # 或其他 Level
    mstx_domain_include=['default', 'my_domain']  # 可选过滤
)
```

### 7.2 显存可视化（export_memory_timeline）

导出训练过程中显存占用的分类可视化文件。

前置条件：
- 安装 matplotlib
- 设置 `record_shapes=True`, `profile_memory=True`, `with_stack=True` 或 `with_modules=True`

```python
def trace_handler(prof):
    prof.export_memory_timeline(output_path="./memory_timeline.html", device="npu:0")

with torch_npu.profiler.profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.NPU],
    schedule=torch_npu.profiler.schedule(wait=0, warmup=0, active=4, repeat=1),
    on_trace_ready=trace_handler,
    record_shapes=True,
    profile_memory=True,
    with_stack=True
) as prof:
    for _ in range(steps):
        train_one_step()
        prof.step()
```

显存分类包括：PARAMETER、OPTIMIZER_STATE、INPUT、TEMPORARY、ACTIVATION、GRADIENT、AUTOGRAD_DETAIL、UNKNOWN。

### 7.3 子线程 Profiling

推理场景下单进程多线程调用 torch 算子时，可在子线程中注册采集回调：

```python
# 子线程内
torch_npu.profiler.profile.enable_profiler_in_child_thread(with_modules=True)
# ... 推理代码 ...
torch_npu.profiler.profile.disable_profiler_in_child_thread()
```

需在主线程已启动 `torch_npu.profiler.profile` 的情况下使用。

---

## 附录 A：常用查询接口

| 接口 | 说明 |
|------|------|
| `torch_npu.profiler.supported_activities()` | 查询支持的 activities（CPU/NPU） |
| `torch_npu.profiler.supported_profiler_level()` | 查询支持的 profiler_level 级别 |
| `torch_npu.profiler.supported_ai_core_metrics()` | 查询支持的 AI Core 性能指标采集项 |
| `torch_npu.profiler.supported_export_type()` | 查询支持的 ExportType 格式 |

## 附录 B：ProfilerAction 状态枚举

| 状态 | 说明 |
|------|------|
| `ProfilerAction.NONE` | 无任何行为 |
| `ProfilerAction.WARMUP` | 性能数据采集预热 |
| `ProfilerAction.RECORD` | 性能数据采集 |
| `ProfilerAction.RECORD_AND_SAVE` | 性能数据采集并保存（触发 on_trace_ready） |

## 附录 C：最小膨胀采集配置

性能数据采集会引入额外的性能膨胀，以下是最小膨胀的推荐配置：

```python
experimental_config = torch_npu.profiler._ExperimentalConfig(
    profiler_level=torch_npu.profiler.ProfilerLevel.Level0,
    data_simplification=True,
    aic_metrics=torch_npu.profiler.AiCMetrics.AiCoreNone
)

with torch_npu.profiler.profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.NPU],
    schedule=torch_npu.profiler.schedule(wait=0, warmup=1, active=1, repeat=1, skip_first=5),
    on_trace_ready=torch_npu.profiler.tensorboard_trace_handler("./result"),
    record_shapes=False,
    profile_memory=False,
    with_stack=False,
    experimental_config=experimental_config
) as prof:
    for step in range(steps):
        train_one_step()
        prof.step()
```

## 附录 D：profiler_level 各级别采集数据对比

| 数据项 | Level_none | Level0 | Level1 | Level2 |
|--------|:----------:|:------:|:------:|:------:|
| 上层应用数据 | - | Y | Y | Y |
| 底层 NPU 数据 | - | Y | Y | Y |
| NPU 算子信息 | - | Y（部分） | Y | Y |
| CANN AscendCL 数据 | - | - | Y | Y |
| AI Core 性能指标 | - | - | Y | Y |
| 通信数据 (communication.json) | - | - | Y | Y |
| api_statistic.csv | - | - | Y | Y |
| CANN Runtime 数据 | - | - | - | Y |
| AI CPU 数据 (data_preprocess.csv) | - | - | - | Y |

## 附录 E：aic_metrics 各指标采集项明细

| 指标 | 采集的子项 |
|------|-----------|
| PipeUtilization | vec_ratio, mac_ratio, scalar_ratio, mte1_ratio, mte2_ratio, mte3_ratio, icache_miss_rate, fixpipe_ratio |
| ArithmeticUtilization | mac_fp16_ratio, mac_int8_ratio, vec_fp32_ratio, vec_fp16_ratio, vec_int32_ratio, vec_misc_ratio |
| Memory | ub_read_bw, ub_write_bw, l1_read_bw, l1_write_bw, l2_read_bw, l2_write_bw, main_mem_read_bw, main_mem_write_bw |
| MemoryL0 | scalar_ld_ratio, scalar_st_ratio, l0a_read_bw, l0a_write_bw, l0b_read_bw, l0b_write_bw, l0c_read_bw, l0c_write_bw |
| ResourceConflictRatio | vec_bankgroup_cflt_ratio, vec_bank_cflt_ratio, vec_resc_cflt_ratio, mte1/2/3_iq_full_ratio, cube_iq_full_ratio, vec_iq_full_ratio |
| L2Cache | ai*_write_cache_hit, ai*_write_cache_miss_allocate, ai*_r*_read_cache_hit, ai*_r*_read_cache_miss_allocate |
