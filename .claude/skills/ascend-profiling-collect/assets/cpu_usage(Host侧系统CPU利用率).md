<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0111.html -->

# cpu_usage（Host侧系统CPU利用率）

Host侧系统CPU利用率数据无timeline信息，summary信息在cpu_usage_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### cpu_usage_*.csv文件说明

cpu_usage_*.csv文件内容格式示例如下：

**图1** cpu_usage_*.csv
![](figure/zh-cn_image_0000002534478587.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Cpu Type | CPU类型。 |
| User(%) | 用户态进程执行时长占比。 |
| Sys(%) | 内核态进程执行时长占比。 |
| IoWait(%) | IO等待状态时长占比。 |
| Irq(%) | 硬件中断时长占比。 |
| Soft(%) | 软中断时长占比。 |
| Idle(%) | 空闲状态时长占比。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
