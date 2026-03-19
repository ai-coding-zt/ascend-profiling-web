# 慢算子排序分析

## 场景描述

训练或推理性能不达预期，需要定位耗时最长的算子，找出性能热点。

## 前提条件

- 已采集性能数据并导出 `op_summary_*.csv`（msprof）或 `kernel_details.csv` / `operator_details.csv`（PyTorch Profiler，CANN 8.5+）
- 或已安装 `msprof-analyze`

## 分析步骤

### 方法一：使用本 skill 脚本

```bash
# 查看 Top-20 慢算子
python scripts/parse_op_summary.py -f op_summary_0.csv -n 20

# 输出 JSON 格式
python scripts/parse_op_summary.py -f op_summary_0.csv -n 20 --json
```

### 方法二：使用 msprof-analyze

```bash
# 计算类算子汇总
msprof-analyze -m compute_op_sum -d ./prof_data

# 指定 Rank 和 Step
msprof-analyze -m compute_op_sum -d ./prof_data --rank_list 0 --step_id 1
```

### 方法三：手动 CSV 分析

```python
import pandas as pd

df = pd.read_csv("op_summary_0.csv")
# 按 Task Duration 降序排序
top_ops = df.sort_values("Task Duration(us)", ascending=False).head(20)
print(top_ops[["OP Name", "OP Type", "Task Duration(us)", "Task Type", "Block Dim"]])

# 计算各算子耗时占比
total = df["Task Duration(us)"].sum()
top_ops["占比(%)"] = (top_ops["Task Duration(us)"] / total * 100).round(2)
```

## 关键指标与阈值

| 指标 | 关注点 |
|------|--------|
| Task Duration(us) | 排序依据，越大越值得优化 |
| OP Type | 算子类型，用于归类分析 |
| Task Type | AI_CORE / AI_CPU / AI_VECTOR_CORE，AI_CPU 算子应尽量避免 |
| Block Dim | 核数，低于设备最大核数说明并行度不足 |
| 累计占比 | Top-10 算子通常占总耗时 80%+ |

## 常见问题与对策

| 发现 | 对策 |
|------|------|
| AI_CPU 算子耗时高 | 替换为 AI Core 实现的算子，参考 advisor AICPU Issues |
| 单个算子耗时异常 | 检查 Input Shapes 是否合理，是否存在动态 Shape |
| Block Dim < 最大核数 | 优化算子实现或输入 Shape 使其能利用更多核 |
| 同类型算子大量重复 | 考虑算子融合 |
