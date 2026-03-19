<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0072.html -->

# aicpu_mi（数据准备的队列）

数据准备的队列大小。数据下沉场景下开启aicpu时生成。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### aicpu_mi_*.csv文件说明

数据准备的队列数据aicpu_mi_*.csv文件内容格式示例如下：

**图1** aicpu_mi_*.csv
![](figure/zh-cn_image_0000002534398509.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Node Name | 数据准备的队列名。 |
| Start Time(us) | 读取数据的开始时间，单位us。 |
| End Time(us) | 读取数据的结束时间，单位us。 |
| Queue Size | 队列大小。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
