# msprof-analyze 命令行完整参考

<!-- source: https://gitee.com/ascend/mstt/blob/master/profiler/msprof_analyze/README.md -->

## 简介

msprof-analyze（MindStudio Profiler Analyze）是 MindStudio 全流程工具链推出的性能分析工具，基于采集的性能数据进行分析，识别 AI 作业中的性能瓶颈。

## 安装

```bash
# pip 安装（推荐）
pip install msprof-analyze

# 指定版本
pip install msprof-analyze==8.1.0

# 源码编译安装
git clone https://gitee.com/ascend/mstt.git
cd mstt/profiler/msprof_analyze
pip3 install -r requirements.txt && python3 setup.py bdist_wheel
pip3 install dist/msprof_analyze-{version}-py3-none-any.whl
```

## 命令格式

### version ≥ 8.2.0a1

```bash
msprof-analyze -m [feature_option] -d <profiling_path> [global_option] [analyze_option]
```

### version < 8.2.0a1

```bash
msprof-analyze cluster -m [feature_option] -d <profiling_path> [global_option] [analyze_option]
```

### 子功能命令

```bash
msprof-analyze advisor [all|computation|schedule] -d <path>   # 专家建议
msprof-analyze compare -d <npu_path> -bp <baseline_path>      # 性能对比
msprof-analyze cluster -m [feature] -d <path>                  # 集群分析（旧版本兼容）
```

## 全局参数

| 参数名 | 说明 | 是否必选 |
|--------|------|----------|
| `--profiling_path` 或 `-d` | 性能数据汇集目录 | 是 |
| `--output_path` 或 `-o` | 自定义输出路径，默认在 -d 目录下创建 cluster_analysis_output | 否 |
| `--mode` 或 `-m` | 分析能力选项，默认 all | 否 |
| `--export_type` | 输出格式：db（默认）/ notebook（Jupyter Notebook） | 否 |
| `--force` | 强制执行：跳过属主判断、文件大小限制 | 否 |
| `--parallel_mode` | 并发方式：concurrent（使用进程池） | 否 |
| `--data_simplification` | 数据精简模式，适用于 all/communication_matrix/communication_time | 否 |
| `-v` / `--version` | 查看版本号 | 否 |
| `-h` / `--help` | 帮助信息 | 否 |

## 分析能力参数

| 参数名 | 说明 | 适用分析能力 |
|--------|------|-------------|
| `--rank_list` | 指定 Rank ID 列表，默认 all | cann_api_sum, compute_op_sum, hccl_sum, mstx_sum |
| `--step_id` | 指定 Step ID 进行分析 | cann_api_sum, compute_op_sum, hccl_sum, mstx_sum |
| `--top_num` | Top-N 通信算子数量，默认 15 | hccl_sum |
| `--exclude_op_name` | 排除 op_name 字段 | compute_op_sum |
| `--bp` | 标杆数据路径 | cluster_time_compare_summary |

## 分析特性完整列表

### 拆解对比类

| 分析能力 | 说明 |
|----------|------|
| cluster_time_summary | 性能数据细粒度拆解，替换 step_trace_time.csv 内容 |
| cluster_time_compare_summary | 性能数据细粒度对比（需 --bp 参数） |

### 计算类

| 分析能力 | 说明 |
|----------|------|
| compute_op_sum | device 侧计算类算子汇总 |
| freq_analysis | AI Core 频率异常检测（空闲 800MHz / 异常非 1800MHz） |
| ep_load_balance | MoE 负载信息汇总分析 |

### 通信类

| 分析能力 | 说明 |
|----------|------|
| communication_matrix | 通信矩阵分析 |
| communication_time | 通信耗时分析 |
| all | 默认值：communication_matrix + communication_time + step_trace_time |
| communication_group_map | 通信域与并行策略映射 |
| communication_time_sum | 通信时间和带宽汇总 |
| communication_matrix_sum | 通信矩阵汇总 |
| hccl_sum | 通信类算子信息汇总 |
| pp_chart | PP 流水图，流水线并行各阶段耗时分析与可视化 |
| slow_rank | 慢卡识别与原因分析 |

### Host 下发类

| 分析能力 | 说明 |
|----------|------|
| cann_api_sum | CANN 层 API 汇总 |
| mstx_sum | MSTX 自定义打点汇总 |

### 数据处理类

| 分析能力 | 说明 |
|----------|------|
| mstx2commop | MSTX 通信打点转通信算子表格式 |
| p2p_pairing | P2P 算子生成全局关联索引（opConnectionId） |

## 使用样例

```bash
# 最简使用
msprof-analyze -m cluster_time_summary -d ./cluster_data

# 全量分析（默认 all）
msprof-analyze -m all -d ./cluster_data

# 指定输出路径
msprof-analyze -m cluster_time_summary -d ./cluster_data -o ./output

# 指定输出格式
msprof-analyze -m cluster_time_summary -d ./cluster_data --export_type db

# 指定 Rank 和 Step
msprof-analyze -m compute_op_sum -d ./prof_data --rank_list 0,1,2 --step_id 1

# 慢卡识别
msprof-analyze -m slow_rank -d ./cluster_data

# 通信算子 Top-20
msprof-analyze -m hccl_sum -d ./prof_data --top_num 20
```

## CANN 版本降级指南

对于 CANN 7.x / 8.0.x 用户，compare_tools 和 cluster_analyse 仍是独立 Python 脚本：

```bash
# 从 ATT 仓库获取
git clone https://gitee.com/ascend/mstt.git
cd mstt/profiler

# compare_tools
python compare_tools/compare_tools.py -d <npu_path> -bp <gpu_trace>

# cluster_analyse
python cluster_analyse/cluster_analysis.py -d <cluster_data> -m <mode>
```

版本检查：
```bash
msprof-analyze --version
pip show msprof-analyze
```
