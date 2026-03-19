<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0092.html -->

# Stars Soc Info（SoC传输带宽信息）

SoC传输带宽信息数据无summary信息，timeline信息在msprof_*.json文件的Stars Soc Info层级展示。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Stars Soc Info层级数据说明

msprof_*.json文件Stars Soc Info层级数据如下图所示。

**图1** Stars Soc Info层
![](figure/zh-cn_image_0000002534398511.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| L2 Buffer Bw Level | L2 Buffer带宽等级信息。当有缓存带宽信息时，不建议参考该字段值，该字段为粗粒度的统计值。 |
| Mata Bw Level | Mata带宽等级信息。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
