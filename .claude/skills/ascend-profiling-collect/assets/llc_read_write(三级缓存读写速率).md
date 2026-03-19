<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0094.html -->

# llc_read_write（三级缓存读写速率）

三级缓存读写速率数据timeline信息在msprof_*.json文件的LLC层级展示，summary信息在llc_read_write_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的LLC层级数据说明

msprof_*.json文件LLC层级数据如下图所示。

**图1** LLC层
![](figure/zh-cn_image_0000002534478521.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| LLC _ <id>_ Read/Throughput LLC <id> Write/Throughput | 三级缓存读取、写入时的吞吐量。 |
| LLC _ <id>_ Read/Hit Rate LLC _ <id>_ Write/Hit Rate | 三级缓存读取、写入时的命中率。 |


#### llc_read_write_*.csv文件说明

llc_read_write_*.csv文件内容格式示例如下：

**图2** llc_read_write_*.csv
![](figure/zh-cn_image_0000002502558660.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Mode | 模式。 |
| Task | 任务ID。 |
| Hit Rate(%) | 三级缓存命中率。 |
| Throughput(MB/s) | 三级缓存吞吐量，单位MB/s。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
