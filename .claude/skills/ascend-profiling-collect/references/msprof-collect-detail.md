# msprof 命令行采集参考手册

msprof 是昇腾 CANN 工具链提供的命令行性能数据采集工具，用于采集昇腾 AI 处理器上
AI 任务运行的性能数据，支持算子耗时、通信、内存、系统级指标等多维度采集。

---

## 1. 命令格式

### 方式一（推荐）

```bash
msprof [options] <application>
```

直接在应用命令前加 `msprof`，工具自动拉起应用并进行性能数据采集。
应用命令中的参数无需额外处理，msprof 会将其透传给应用。

示例：

```bash
msprof --output=/home/data python train.py --epochs=10 --batch-size=32
```

### 方式二

```bash
msprof [options] --application="<application>"
```

通过 `--application` 参数指定被采集应用。应用命令需用引号包裹。

示例：

```bash
msprof --output=/home/data --application="python train.py --epochs=10"
```

### 通用选项

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--output` | 性能数据输出目录。目录须提前创建，采集完成后在该目录下生成带时间戳的子目录 | 目录路径 | 当前目录 |
| `--type` | 输出格式 | `text` / `db` | `db` |
| `--environment` | 运行环境声明，在容器内采集时需要指定 | `docker` / `lxc` 等 | 自动识别 |
| `--storage-limit` | 数据存储上限（MB），超过后自动停止采集 | 正整数 | 无限制 |
| `--python-path` | Python 解释器路径，采集 Python 应用时若默认 python 不正确可手动指定 | 路径 | 环境变量中的 python |

> **输出格式说明**：
> - `db`：输出 SQLite 数据库格式，可用 Ascend Insight、MindStudio 等工具可视化分析。
> - `text`：输出文本/CSV 文件，便于脚本批量处理和自动化分析流水线。

---

## 2. AI 任务性能数据采集

采集昇腾 AI 处理器上运行的 AI 任务性能数据，包括算子耗时、AscendCL 接口调用、
通信算子、AI Core 硬件计数器、内存使用等信息。

这是最常用的采集模式，适用于模型训练和推理场景的性能分析。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--ascendcl` | AscendCL 接口耗时数据采集，包括数据传输、模型加载、算子调用等接口 | `on` / `off` | `on` |
| `--task-time` | 算子执行耗时采集级别，控制采集粒度和数据量 | `off` / `l0` / `l1` / `on` | `on` |
| `--runtime-api` | Runtime API 耗时数据采集，采集底层 Runtime 接口调用时间 | `on` / `off` | `off` |
| `--hccl` | HCCL 通信数据采集 | `on` / `off` | `off` |
| `--model-execution` | 模型执行数据采集 | `on` / `off` | `off` |
| `--aicpu` | AI CPU 算子数据采集，采集在 AI CPU 上执行的算子信息 | `on` / `off` | `off` |
| `--ai-core` | AI Core 硬件信息采集，开启后可采集硬件 PMU 计数器数据 | `on` / `off` | `off` |
| `--aic-mode` | AI Core 采集模式，需先开启 `--ai-core=on` | `task-based` / `sample-based` | `task-based` |
| `--aic-freq` | AI Core sample-based 模式采样频率（Hz），仅在 `--aic-mode=sample-based` 时有效 | 正整数 | - |
| `--aic-metrics` | AI Core 采集指标集，指定采集哪组硬件计数器指标 | 预定义指标集名称 | - |
| `--sys-hardware-mem` | 系统硬件内存带宽数据采集（AI 任务模式） | `on` / `off` | `off` |
| `--sys-hardware-mem-freq` | 硬件内存带宽采样频率（ms） | 正整数 | - |
| `--l2` | L2 Cache 数据采集 | `on` / `off` | `off` |
| `--ge-api` | GE（Graph Engine）API 数据采集级别 | `off` / `l0` / `l1` | `off` |
| `--task-memory` | 算子级内存使用数据采集，可查看每个算子的内存分配和释放 | `on` / `off` | `off` |

> **废弃参数说明**：
> - `--hccl` 已废弃，其功能已合并到 `--task-time` 中。`--task-time=l1` 或 `on` 即包含通信算子详细信息。
> - `--model-execution` 已废弃，其功能已合并到 `--task-time` 中。`--task-time=on` 即包含模型执行信息。
> - 为兼容已有脚本，这两个参数仍可使用，但建议统一使用 `--task-time`。

### task-time 级别说明

| 级别 | 采集内容 | 数据量 | 适用场景 |
|------|----------|--------|----------|
| `off` | 不采集算子耗时 | 无 | 仅需系统级数据时 |
| `l0` | 仅采集算子基础耗时信息 | 最小 | 快速定位慢算子，开销最低 |
| `l1` | 采集算子耗时 + 通信算子详细信息 | 中等 | 分析通信瓶颈 |
| `on` | 采集全部算子耗时数据（等同 `l1` + 模型执行信息） | 最大 | 全面分析，默认模式 |

### aic-mode 模式说明

- **task-based**：按算子任务粒度采集 AI Core 硬件计数器数据。每个算子执行前后各读取一次计数器，
  可精确对应到每个算子的硬件指标（如计算利用率、内存带宽利用率等）。
  开销较高，但数据精度最好。

- **sample-based**：按固定频率采样 AI Core 硬件计数器数据。
  以 `--aic-freq` 指定的频率周期性读取计数器。
  开销更低，适用于长时间运行任务，但采样数据无法精确对应到单个算子。

### ge-api 级别说明

| 级别 | 采集内容 |
|------|----------|
| `off` | 不采集 GE API 数据 |
| `l0` | 采集图编译和图执行的耗时信息 |
| `l1` | 在 `l0` 基础上增加图优化各阶段的详细耗时 |

---

## 3. 昇腾 AI 处理器系统数据采集

采集处理器芯片级系统性能数据，不依赖具体 AI 任务。
可用于监控设备整体运行状态、分析系统瓶颈。

该模式下的采集参数以 `--sys-` 开头，与 AI 任务采集参数可同时使用。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--sys-period` | 系统数据采集周期（ms），控制整体采集的时间粒度 | 正整数 | - |
| `--sys-devices` | 指定采集的设备 ID 列表，多个设备用逗号分隔 | 逗号分隔的设备 ID | 所有设备 |
| `--sys-cpu-profiling` | 设备侧 CPU 性能数据采集 | `on` / `off` | `off` |
| `--sys-cpu-freq` | CPU 性能数据采样频率（ms） | 正整数 | - |
| `--sys-profiling` | 系统级性能采集（整体设备利用率等） | `on` / `off` | `off` |
| `--sys-sampling-freq` | 系统级采样频率（ms） | 正整数 | - |
| `--sys-pid-profiling` | 进程级性能采集（按进程统计设备资源使用） | `on` / `off` | `off` |
| `--sys-pid-sampling-freq` | 进程级采样频率（ms） | 正整数 | - |
| `--sys-io-profiling` | IO 性能数据采集（设备侧存储 IO） | `on` / `off` | `off` |
| `--sys-io-sampling-freq` | IO 采样频率（ms） | 正整数 | - |
| `--sys-interconnection-profiling` | 芯片互联性能数据采集（多芯片间通信带宽、延迟） | `on` / `off` | `off` |
| `--sys-interconnection-freq` | 芯片互联采样频率（ms） | 正整数 | - |
| `--sys-hardware-mem` | 硬件内存带宽数据采集（系统模式） | `on` / `off` | `off` |
| `--dvpp-profiling` | DVPP（Digital Vision Pre-Processing）媒体数据处理性能采集 | `on` / `off` | `off` |
| `--instr-profiling` | 指令级性能数据采集 | `on` / `off` | `off` |
| `--llc-profiling` | LLC（Last Level Cache）性能采集，指定采集读或写方向 | `read` / `write` | - |

> **`--sys-hardware-mem` 双模式说明**：
> - 在 **系统数据采集模式** 下，采集的是芯片级全局内存带宽数据，反映整个设备的内存带宽使用情况。
> - 在 **AI 任务采集模式**（第 2 节）下，采集的是与当前任务相关的内存带宽数据。
> - 两种模式的采集范围和数据含义不同，请根据分析需求选择。

### 采集频率参数说明

每个采集项都有对应的频率参数，频率值越小采集越频繁，数据越细致但开销越大。
建议根据实际需求平衡采集精度和性能开销：

| 采集场景 | 建议频率范围 |
|----------|-------------|
| 快速概览 | 500ms - 1000ms |
| 常规分析 | 100ms - 500ms |
| 精细分析 | 10ms - 100ms |

---

## 4. Host 侧系统数据采集

采集运行 AI 任务的 Host 侧（服务器 CPU、内存、磁盘、网络等）系统性能数据。
用于定位 Host 侧瓶颈，例如数据预处理导致的 CPU 瓶颈、内存不足、磁盘 IO 瓶颈等。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--host-sys` | Host 侧系统数据采集项，可指定多个，逗号分隔 | `cpu`, `mem`, `disk`, `network`, `osrt` | - |
| `--host-sys-usage` | Host 侧资源利用率采集项，采集利用率百分比的时间序列 | `cpu`, `mem` | - |
| `--host-sys-pid` | 指定采集的进程 PID，默认为被采集应用的 PID | 进程 PID | 被采集应用 PID |
| `--host-sys-usage-freq` | 资源利用率采样频率（ms） | 正整数 | - |

### host-sys 采集项说明

| 采集项 | 说明 | 典型用途 |
|--------|------|----------|
| `cpu` | Host CPU 性能数据（上下文切换、中断、各核利用率等） | 定位 CPU 瓶颈、数据预处理性能 |
| `mem` | Host 内存使用数据（页表、缺页、swap 使用等） | 定位内存不足、内存泄漏 |
| `disk` | 磁盘 IO 读写性能数据（IOPS、吞吐量、延迟等） | 定位数据加载瓶颈 |
| `network` | 网络收发包性能数据（带宽、包量、丢包等） | 定位分布式训练网络瓶颈 |
| `osrt` | 操作系统运行时数据（调度延迟、系统调用等） | 定位 OS 级调度问题 |

### host-sys-usage 说明

`--host-sys-usage` 与 `--host-sys` 的区别：

- `--host-sys`：采集详细的性能事件计数器数据（perf 数据）。
- `--host-sys-usage`：采集资源利用率百分比的时间序列数据，开销更低，适合长时间监控。

---

## 5. 动态采集

在应用运行过程中按需启停采集，适用于长时间运行的训练任务，只采集感兴趣的时间段。
避免采集全程数据导致的大量数据存储和分析负担。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--dynamic` | 启用动态采集模式 | `on` | - |
| `--pid` | 指定已运行进程的 PID（attach 模式） | 进程 PID | - |

### 两种模式

#### Launch 模式

由 msprof 拉起应用，应用启动后进入交互式命令行，手动控制采集时机：

```bash
msprof --dynamic=on --output=/output/path python train.py
```

应用启动后，msprof 进入交互模式，此时不会自动采集。
用户通过输入 `start` 命令开始采集，`stop` 命令停止采集。

#### Attach 模式

对已经在运行的进程进行性能采集，无需重启应用。需指定目标进程的 `--pid`：

```bash
msprof --dynamic=on --pid=<PID> --output=/output/path
```

适用于不方便重启的生产环境或长时间运行的训练任务。

### 交互式命令

进入动态采集模式后，可使用以下命令：

| 命令 | 说明 |
|------|------|
| `start` | 开始采集性能数据 |
| `stop` | 停止采集性能数据，生成当次采集的数据文件 |
| `quit` | 退出动态采集模式（Launch 模式下不会终止被采集应用） |

> 可多次执行 `start` / `stop` 循环，每次生成独立的采集数据目录。
> 这种方式可以精确采集多个不同阶段（如不同 epoch、不同 step 区间）的性能数据。

### 动态采集中使用其他采集参数

动态采集模式下，仍可组合使用 AI 任务采集参数，例如：

```bash
msprof --dynamic=on --ai-core=on --task-time=l0 --output=/output/path python train.py
```

---

## 6. 延迟采集

指定采集的起始延迟和持续时长，避免采集应用启动阶段（模型编译、数据加载等）的无关数据，
聚焦于稳态运行阶段的性能分析。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--delay` | 延迟开始采集的时间（秒），从应用启动开始计时 | 非负整数 | `0` |
| `--duration` | 采集持续时长（秒），到时自动停止采集 | 正整数 | 应用运行全程 |

### 使用场景

- **跳过编译期**：模型首次运行时会触发图编译，耗时较长且不代表真实性能。
  设置 `--delay` 跳过编译阶段。
- **限制数据量**：长时间训练只需采集几个 step 的数据即可分析，
  设置 `--duration` 限制采集时长。
- **组合使用**：`--delay=120 --duration=60` 表示启动后第 120 秒到第 180 秒之间采集数据。

### 示例

```bash
# 延迟 60 秒后开始采集，持续采集 30 秒
msprof --delay=60 --duration=30 --output=/output/path python train.py
```

```bash
# 仅设置延迟，采集到应用结束
msprof --delay=300 --output=/output/path python train.py
```

```bash
# 仅设置持续时长，从应用启动立即采集
msprof --duration=120 --output=/output/path python train.py
```

---

## 7. msproftx 数据采集

采集用户通过 msproftx API 插入的自定义标记数据。msproftx 允许用户在代码中插入
range（时间区间标记）和 marker（时间点标记），用于标记自定义的性能关注区间，
例如标记某个训练 step、某个函数调用、某个数据加载阶段等。

### 参数表

| 参数 | 说明 | 取值 | 默认值 |
|------|------|------|--------|
| `--msproftx` | 启用 msproftx 数据采集 | `on` / `off` | `off` |
| `--mstx-domain-include` | 仅采集指定 domain 的 msproftx 数据 | 逗号分隔的 domain 名称 | 全部 domain |
| `--mstx-domain-exclude` | 排除指定 domain 的 msproftx 数据 | 逗号分隔的 domain 名称 | 不排除 |

> **注意**：
> - `--mstx-domain-include` 和 `--mstx-domain-exclude` 互斥，不能同时使用。
> - Domain 是 msproftx API 中用于分组管理标记的命名空间，便于按模块过滤采集数据。

---

## 8. 常用采集命令示例

### 采集 AI 任务全部数据

```bash
msprof --output=/output/path python train.py
```

默认开启 `--ascendcl=on` 和 `--task-time=on`，采集 AscendCL 接口与全部算子耗时数据。

### 仅采集算子耗时（最小开销）

```bash
msprof --ascendcl=off --task-time=l0 --output=/output/path python train.py
```

关闭 AscendCL 采集，仅采集算子基础耗时信息，性能开销最小。

### 采集通信 + 算子耗时数据

```bash
msprof --task-time=l1 --output=/output/path python train.py
```

### 采集 AI Core 硬件计数器数据

```bash
msprof --ai-core=on --aic-mode=task-based --output=/output/path python train.py
```

### 采集 Host 侧 CPU 和内存

```bash
msprof --host-sys=cpu,mem --host-sys-usage=cpu,mem --output=/output/path python train.py
```

### 动态采集

```bash
# Launch 模式
msprof --dynamic=on --output=/output/path python train.py

# Attach 模式（对已运行进程）
msprof --dynamic=on --pid=12345 --output=/output/path
```

### 延迟采集指定时间段

```bash
msprof --delay=120 --duration=60 --output=/output/path python train.py
```

### 采集系统级数据

```bash
msprof --sys-profiling=on --sys-cpu-profiling=on --sys-devices=0,1 --output=/output/path python train.py
```

### 采集 msproftx 自定义标记

```bash
msprof --msproftx=on --output=/output/path python train.py
```

---

## 9. 参数组合注意事项

1. **task-time 替代关系**：`--hccl` 和 `--model-execution` 已废弃，
   其功能已合并到 `--task-time` 的不同级别中。建议统一使用 `--task-time`。

2. **ai-core 依赖**：使用 `--aic-mode`、`--aic-freq`、`--aic-metrics`
   前须先开启 `--ai-core=on`，否则这些参数不生效。

3. **sys-hardware-mem 双模式**：该参数在 AI 任务采集和系统数据采集中含义不同，
   注意区分使用场景（参见第 2、3 节说明）。

4. **动态采集限制**：`--dynamic=on` 不能与 `--delay` / `--duration` 同时使用，
   二者是互斥的采集控制方式。

5. **存储限制**：大规模采集建议设置 `--storage-limit` 避免磁盘空间耗尽，
   特别是开启 `--ai-core=on` 或 `--task-time=on` 时数据量可能较大。

6. **容器环境**：在 Docker 或 LXC 容器中采集时，须指定 `--environment=docker`
   或 `--environment=lxc`，否则可能导致采集异常。

7. **多设备采集**：多卡训练时，msprof 默认采集所有设备的数据。
   可通过 `--sys-devices` 限定设备范围，减少数据量。

8. **数据分析工具**：
   - `--type=db` 输出可用 Ascend Insight 或 MindStudio 工具可视化分析。
   - `--type=text` 输出可用脚本处理或导入 Excel 等工具分析。
