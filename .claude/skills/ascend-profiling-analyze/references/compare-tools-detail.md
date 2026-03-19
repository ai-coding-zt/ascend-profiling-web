# compare 子功能完整参考

<!-- source: https://gitee.com/ascend/mstt/blob/master/profiler/msprof_analyze/compare_tools/README.md -->

## 简介

msprof-analyze 的 compare 子功能提供 NPU 与 GPU 之间、NPU 与 NPU 之间两组性能数据的深度对比，通过多维度量化指标直观呈现性能差异。

## 命令格式

```bash
msprof-analyze compare -d <npu_profiling_path> -bp <baseline_path> [-o output_path] [options]
```

## 参数说明

| 参数 | 说明 | 必选 |
|------|------|------|
| `-d` | 昇腾 NPU 性能数据目录（*_ascend_pt 或 PROF_XXX） | 是 |
| `-bp` | 基准性能数据：GPU trace.json 或第二组 NPU 数据目录 | 是 |
| `-o` | 对比结果输出目录 | 否 |

## 输入数据要求

### NPU 侧

- Ascend PyTorch Profiler 采集的 `*_ascend_pt` 目录
- 或 msprof 采集的 `PROF_XXX` 目录

### GPU 侧（作为基准 -bp）

- PyTorch Profiler 导出的 `trace.json` 文件
- 使用 `torch.profiler.profile` 采集并导出

### NPU vs NPU

- 两组相同模型、相同数据的 NPU profiling 数据

## 输出文件

### performance_comparison_result_{timestamp}.xlsx

对比报告包含多个维度：

#### 宏观性能拆分

按计算、通信、空闲三大维度统计耗时占比差异：
- Computing Time：计算耗时
- Communication Time：通信耗时
- Free Time：空闲/等待时间
- 各维度的占比和差异

#### 细粒度算子对比

| 字段 | 说明 |
|------|------|
| Op Type | 算子类型（Conv, MatMul, BN 等） |
| NPU Duration | NPU 侧耗时 |
| Baseline Duration | 基准侧耗时 |
| Diff Ratio | 耗时比值 |
| Call Count | 调用次数 |
| Diff Count | 次数差异 |

#### 框架接口对比

按 API 粒度展示耗时差异，定位具体性能差距点。

## 使用样例

```bash
# NPU vs GPU
msprof-analyze compare -d ./ascend_pt -bp ./gpu_trace.json -o ./compare_output

# NPU vs NPU（不同版本对比）
msprof-analyze compare -d ./new_version_pt -bp ./old_version_pt -o ./compare_output
```

## 解读对比报告

### 筛选劣化算子

1. 打开 xlsx 文件的算子对比 sheet
2. 按 Diff Ratio 排序（升序）
3. Diff Ratio < 1 的算子为劣化算子
4. 结合 Call Count 和 Duration 判断影响程度

### 宏观分析流程

1. 先看宏观拆分：计算/通信/空闲哪个维度差距最大
2. 进入对应维度的细粒度分析
3. 定位具体劣化算子或 API
4. 针对性优化

## CANN 版本兼容

- **≥ 8.2.0a1**：`msprof-analyze compare`
- **< 8.2.0a1**：需从 ATT 仓库使用独立脚本

```bash
# 旧版本
cd mstt/profiler/compare_tools
python compare_tools.py -d <npu_path> -bp <gpu_trace>
```
