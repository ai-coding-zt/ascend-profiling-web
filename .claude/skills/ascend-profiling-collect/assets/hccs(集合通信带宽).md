<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0086.html -->

# hccs（集合通信带宽）

HCCS集合通信带宽数据timeline信息在msprof_*.json文件的HCCS层级展示，summary信息在hccs_*.csv文件汇总。

#### 支持的型号

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的HCCS层级数据说明

msprof_*.json文件HCCS层级数据如下图所示。

**图1** HCCS层
![](figure/zh-cn_image_0000002534478575.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Rx、Tx | 接收带宽、发送带宽，单位MB/s。 |


#### hccs_*.csv文件说明

hccs_*.csv文件内容格式示例如下：

**图2** hccs_*.csv
![](figure/zh-cn_image_0000002502718546.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Mode | Tx（发送带宽），Rx（接收带宽），单位MB/s。 |
| Max | 最大带宽，单位MB/s。 |
| Min | 最小带宽，单位MB/s。 |
| Average | 平均带宽，单位MB/s。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
