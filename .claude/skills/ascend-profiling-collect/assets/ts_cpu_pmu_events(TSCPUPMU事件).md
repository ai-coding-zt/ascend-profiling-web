<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0104.html -->

# ts_cpu_pmu_events（TS CPU PMU事件）

TS CPU PMU事件数据无timeline信息，summary信息在ts_cpu_pmu_events_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### ts_cpu_pmu_events_*.csv文件说明

ts_cpu_pmu_events_*.csv文件内容格式示例如下：

**图1** ts_cpu_pmu_events_*.csv
![](figure/zh-cn_image_0000002502718508.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Event | 寄存器的值。 |
| Name | 值对应的事件名。 |
| Count | 寄存器的计数值。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
