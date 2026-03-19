<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0081.html -->

# process_mem（进程内存占用数据）

进程内存占用数据无timeline信息，summary信息在process_mem_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### process_mem_*.csv文件数据说明

process_mem_*.csv文件内容格式示例如下：

**图1** process_mem_*.csv
![](figure/zh-cn_image_0000002502558800.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| PID | 进程ID。 |
| Name | 进程名称。 |
| Size(pages) | 进程占用内存页数。 |
| Resident(pages) | 进程占用的物理内存页数。 |
| Shared(pages) | 进程占用的共享内存页数。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
