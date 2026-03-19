<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0093.html -->

# Stars Chip Trans（片间传输带宽信息）

片间传输带宽信息数据无summary信息，timeline信息在msprof_*.json文件的Stars Chip Trans层级展示。

#### 支持的型号

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Stars Chip Trans层级数据说明

msprof_*.json文件Stars Chip Trans层级数据如下图所示。

**图1** Stars Chip Trans层
![](figure/zh-cn_image_0000002534398637.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| PA Link Rx | PA流量接收级别。当有集合通信带宽时，不建议参考该字段值，该字段为粗粒度的统计值。 |
| PA Link Tx | PA流量发送级别。当有集合通信带宽时，不建议参考该字段值，该字段为粗粒度的统计值。 |
| PCIE Read Bandwidth | PCIe读带宽。当有PCIe带宽时，不建议参考该字段值，该字段为粗粒度的统计值。 |
| PCIE Write Bandwidth | PCIe写带宽。当有PCIe带宽时，不建议参考该字段值，该字段为粗粒度的统计值。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
