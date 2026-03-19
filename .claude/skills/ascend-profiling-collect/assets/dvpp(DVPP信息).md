<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0098.html -->

# dvpp（DVPP信息）

DVPP数据无timeline信息，summary信息在dvpp_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### dvpp_*.csv文件说明

dvpp_*.csv文件内容格式示例如下：

**图1** dvpp_*.csv
![](figure/zh-cn_image_0000002534478499.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Dvpp Id | Engine group的ID。 说明： 当前每一类Engine都只有一个group，所以该字段均为0。 |
| Engine Type | 引擎类型，包含VDEC、JPEGD、PNGD等。 |
| Engine ID | Engine group中每个Engine实例的编号。 |
| All Time(us) | 采样周期内本引擎执行的时间，单位us。 |
| All Frame | 采样周期内处理的帧数。 |
| All Utilization(%) | 采样周期内本引擎的利用率，本引擎执行的时间/采样周期。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
