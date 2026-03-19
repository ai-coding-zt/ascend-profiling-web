# msprof 解析与导出性能数据参考

## 1. 解析性能数据 (msprof --parse)

仅解析原始性能数据，不导出文件。主要使用场景：

- 首次解析失败（残留文件）时，重新解析后再执行 `msprof --export`
- 需要指定 `--iteration-id` / `--model-id` 导出时，先解析并查看可用的 Iteration ID 和 Model ID

### 命令

```bash
msprof --parse=on --output=<dir>
```

### 参数

| 参数 | 说明 | 必选 |
|------|------|------|
| `--parse` | 解析原始性能数据文件，可选 on/off，默认 off | 是 |
| `--output` | 原始性能数据目录，须指定为 PROF_XXX 目录或其父目录。路径不支持特殊字符 | 是 |
| `--python-path` | 指定 Python 解释器路径，要求 Python 3.7.5 及以上 | 否 |

### 输出

在 PROF_XXX 的 `device_{id}` 和 `host` 目录下生成 `sqlite` 目录，内含 `.db` 文件。同时打印性能数据文件信息。

---

## 2. 解析并导出性能数据 (msprof --export)

解析并导出性能数据为 timeline（JSON）和 summary（CSV/JSON）文件。对于未解析的 PROF_XXX 文件，会自动先解析再导出。

### 命令

```bash
msprof --export=on --output=<dir> \
  [--type=<type>] \
  [--reports=<reports_sample_config.json>] \
  [--iteration-id=<number>] \
  [--model-id=<number>] \
  [--summary-format=<csv/json>] \
  [--clear=on]
```

### 参数

| 参数 | 说明 | 必选 |
|------|------|------|
| `--export` | 解析并导出性能数据，可选 on/off，默认 off | 是 |
| `--output` | 性能数据目录，须指定为 PROF_XXX 目录或其父目录。路径不支持特殊字符 | 是 |
| `--type` | 导出格式：`text`（默认）导出 JSON/CSV + db 文件；`db` 仅导出汇总 db 文件（此时不支持其他参数） | 否 |
| `--reports` | 自定义 reports_sample_config.json 配置文件路径，按配置范围导出 timeline 数据。仅支持 `--type=text` | 否 |
| `--iteration-id` | 迭代 ID，正整数，默认 1。必须与 `--model-id` 同时配置 | 否 |
| `--model-id` | 模型 ID，正整数。必须与 `--iteration-id` 同时配置 | 否 |
| `--summary-format` | summary 数据导出格式：`csv`（默认）或 `json`。仅 `--type=text` 时支持 | 否 |
| `--python-path` | 指定 Python 解释器路径，要求 Python 3.7.5 及以上 | 否 |
| `--clear` | 数据精简模式，on 时导出后删除 `device_{id}` 下的 sqlite 目录以节省空间。默认 off | 否 |

### iteration-id / model-id 说明

- `--model-id=4294967295`：Step 模式，`--iteration-id` 以 Step 为粒度（每完成一个 Step，ID 加 1）。仅支持 MindSpore >= 2.3。
- `--model-id` 为其他值：Graph 模式，`--iteration-id` 以 Graph 为粒度（每个 Graph 执行一次，ID 加 1）。
- 单算子场景和仅采集系统数据场景不支持这两个参数。

### 示例

```bash
# 导出全量数据（text格式）
msprof --export=on --output=/home/user/profiler_data/PROF_XXX

# 指定迭代导出
msprof --export=on --output=/home/user/profiler_data/PROF_XXX \
  --iteration-id=3 --model-id=1

# 仅导出db格式
msprof --export=on --output=/home/user/profiler_data/PROF_XXX --type=db

# 使用自定义reports配置
msprof --export=on --output=./ \
  --reports=${INSTALL_DIR}/tools/profiler/profiler_tool/analysis/msconfig/reports_sample_config.json
```

---

## 3. 查询性能数据文件信息 (msprof --query)

用于查询已解析的 PROF_XXX 目录的性能数据文件信息，确认可用的 Iteration ID / Model ID。解析时会自动打印，故本功能主要用于已解析的历史数据重新查询。

### 命令

```bash
msprof --query=on --output=<dir>
```

### 参数

| 参数 | 说明 | 必选 |
|------|------|------|
| `--query` | 查询性能数据文件信息，可选 on/off，默认 off | 是 |
| `--output` | 已解析的性能数据目录，须指定为 PROF_XXX 目录或其父目录 | 是 |

### 输出字段

| 字段 | 含义 |
|------|------|
| Job Info | 任务名 |
| Device ID | 设备 ID |
| Dir Name | 文件夹名称 |
| Collection Time | 数据采集时间 |
| Model ID | 模型 ID |
| Iteration Number | 总迭代数 |
| Top Time Iteration | 耗时最长的 5 个迭代 |
| Rank ID | 集群场景的节点识别 ID |

---

## 4. 输出目录结构

### 单采集进程

```
PROF_XXX/
├── device_0/
│   └── data/
├── device_1/
│   └── data/
├── host/
│   └── data/
├── msprof_*.db                        # 汇总所有性能数据的 db 文件
└── mindstudio_profiler_output/
    ├── msprof_{timestamp}.json        # timeline 数据（Chrome Trace 格式）
    ├── step_trace_{timestamp}.json    # Step 级别 timeline
    ├── xx_*.csv                       # summary 汇总表
    ├── ...
    └── README.txt
```

### 多采集进程

每个采集进程生成独立的 PROF_XXX 目录，结构与单进程相同：

```
PROF_XXX1/
├── device_0/
├── host/
├── msprof_*.db
└── mindstudio_profiler_output/
PROF_XXX2/
├── device_1/
├── host/
├── msprof_*.db
└── mindstudio_profiler_output/
```

### 说明

- `msprof_*.db`：汇总 db 文件，可用 MindStudio Insight 工具打开。
- `msprof_{timestamp}.json`：timeline 信息，以色块形式展示算子、任务运行耗时。
- `xx_*.csv`：summary 信息，以表格形式汇总运行耗时。
- `mindstudio_profiler_output` 中的文件根据实际采集的数据生成，未采集的数据不会导出对应文件。
- 多 Device 场景下，单采集进程仅生成一个 PROF_XXX 目录；多采集进程生成多个。

---

## 5. reports_sample_config.json 配置

该配置文件控制 timeline 数据（JSON 文件）的导出层级。仅控制 timeline，CSV summary 数据始终全量导出。

默认路径：`${INSTALL_DIR}/tools/profiler/profiler_tool/analysis/msconfig/reports_sample_config.json`

可在任意有读写权限的目录下自行创建。

```json
{
    "json_process": {
        "ascend": true,
        "acc_pmu": true,
        "cann": true,
        "ddr": true,
        "stars_chip_trans": true,
        "hbm": true,
        "communication": true,
        "hccs": true,
        "os_runtime_api": true,
        "network_usage": true,
        "disk_usage": true,
        "memory_usage": true,
        "cpu_usage": true,
        "msproftx": true,
        "npu_mem": true,
        "overlap_analyse": true,
        "pcie": true,
        "sio": true,
        "stars_soc": true,
        "step_trace": true,
        "freq": true,
        "llc": true,
        "nic": true,
        "roce": true,
        "qos": true,
        "device_tx": true
    }
}
```

每个字段对应 timeline 中的一个数据层级，设为 `true` 启用，`false` 或删除字段关闭。导出的前提是原始数据中已采集了相应数据。

文件格式错误（如拼写错误）时 `--reports` 参数不生效，会导出全量数据；文件读取失败（权限、不存在等）会中断导出并报错。

---

## 6. msprof.py 脚本（替代方案）

除 `msprof` 命令行工具外，还可使用 Python 脚本进行解析与导出：

```bash
python3 ${INSTALL_DIR}/tools/profiler/profiler_tool/analysis/msprof/msprof.py
```

功能与 `msprof` 命令行一致，支持解析、查询、导出操作。适用于需要在 Python 环境中集成的场景。
