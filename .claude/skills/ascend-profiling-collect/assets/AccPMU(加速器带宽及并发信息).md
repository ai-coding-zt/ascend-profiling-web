<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0091.html -->

# Acc PMU（加速器带宽及并发信息）

加速器带宽及并发数据无summary信息，timeline信息在msprof_*.json文件的Acc PMU层级展示。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Acc PMU层级数据说明

msprof_*.json文件Acc PMU层级数据如下图所示。

**图1** Acc PMU层
![](figure/zh-cn_image_0000002534478625.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| read_bandwidth | DVPP和DSA加速器读带宽。 |
| read_ost | DVPP和DSA加速器读并发。 |
| write_bandwidth | DVPP和DSA加速器写带宽。 |
| write_ost | DVPP和DSA加速器写并发。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
