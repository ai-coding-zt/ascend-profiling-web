<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0083.html -->

# process_cpu_usage（进程CPU占用率）

进程CPU占用率数据无timeline信息，summary信息在process_cpu_usage文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### process_cpu_usage_*.csv文件数据说明

process_cpu_usage_*.csv文件内容格式示例如下：

**图1** process_cpu_usage_*.csv
![](figure/zh-cn_image_0000002534478489.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| PID | 进程ID。 |
| Name | 进程名称。 |
| CPU(%) | 该进程CPU占用率。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
