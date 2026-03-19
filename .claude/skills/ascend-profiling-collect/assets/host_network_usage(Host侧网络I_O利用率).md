<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0109.html -->

# host_network_usage（Host侧网络I/O利用率）

Host侧网络I/O利用率数据timeline信息在msprof_*.json文件的Network Usage层级展示，summary信息在host_network_usage_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Network Usage层级数据说明

msprof_*.json文件Network Usage层级数据如下图所示。

**图1** Network Usage层
![](figure/zh-cn_image_0000002502558764.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Network Usage | 网络I/O利用率。 |


#### host_network_usage_*.csv文件说明

host_network_usage_*.csv文件内容格式示例如下：

**图2** host_network_usage_*.csv
![](figure/zh-cn_image_0000002534478631.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Netcard Speed(KB/s) | 网卡的额定速率，单位KB/s。 |
| Peak Used Speed(KB/s) | 网络最高的使用速率，单位KB/s。 |
| Recommend Speed(KB/s) | 虚拟化场景中网络使用速率的推荐值，单位KB/s。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
