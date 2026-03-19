<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0075.html -->

# npu_mem（NPU内存占用）

NPU内存占用数据timeline信息在msprof_*.json文件的NPU MEM层级展示，summary信息在npu_mem_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的NPU MEM层级数据说明

msprof_*.json文件NPU MEM层级数据如下图所示。（下图仅为示例，实际呈现以产品实现为准）

**图1** NPU MEM层
![](figure/zh-cn_image_0000002534398541.png)

上图展示了进程级和设备级的内存占用情况，单位为KB，其中Memory字段表示内存占用总和。

#### npu_mem_*.csv文件说明

npu_mem_*.csv文件内容格式示例如下：

**图2** npu_mem_*.csv
![](figure/zh-cn_image_0000002502718528.png)

上表为内存占用情况明细，单位为KB，其中Memory字段表示内存占用总和。

**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
