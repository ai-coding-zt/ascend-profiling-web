<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0108.html -->

# host_disk_usage（Host侧磁盘I/O利用率）

Host侧磁盘I/O利用率数据timeline信息在msprof_*.json文件的Disk Usage层级展示，summary信息在host_disk_usage_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Disk Usage层级数据说明

msprof_*.json文件Disk Usage层级数据如下图所示。

**图1** Disk Usage层
![](figure/zh-cn_image_0000002534398551.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Disk Usage | 磁盘利用率。 |


#### host_disk_usage_*.csv文件说明

host_disk_usage_*.csv文件内容格式示例如下：

**图2** host_disk_usage_*.csv
![](figure/zh-cn_image_0000002502558712.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Peak Disk Read(KB/s) | 磁盘读取速率的峰值，单位KB/s。 |
| Recommend Disk Read(KB/s) | 虚拟化场景中磁盘读取速率的推荐值，单位KB/s。 |
| Peak Disk Write(KB/s) | 磁盘写入速率的峰值，单位KB/s。 |
| Recommend Disk Write(KB/s) | 虚拟化场景中磁盘写入速率的推荐值，单位KB/s。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
