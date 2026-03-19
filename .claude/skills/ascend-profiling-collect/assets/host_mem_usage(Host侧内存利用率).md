<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0107.html -->

# host_mem_usage（Host侧内存利用率）

Host侧内存利用率数据timeline信息在msprof_*.json文件的Memory Usage层级展示，summary信息在host_mem_usage_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的Memory Usage层级数据说明

msprof_*.json文件Memory Usage层级数据如下图所示。

**图1** Memory Usage层
![](figure/zh-cn_image_0000002534398469.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Memory Usage | 内存使用率。 |


#### host_mem_usage_*.csv文件说明

host_mem_usage_*.csv文件内容格式示例如下：

**图2** host_mem_usage_*.csv
![](figure/zh-cn_image_0000002502718456.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Total Memory(KB) | 系统总内存，单位KB。 |
| Peak Used Memory(KB) | 内存使用峰值，单位KB。 |
| Recommend Memory(KB) | 虚拟化场景中内存的推荐分配值，单位KB。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
