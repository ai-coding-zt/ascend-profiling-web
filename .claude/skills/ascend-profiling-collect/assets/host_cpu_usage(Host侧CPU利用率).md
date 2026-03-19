<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0106.html -->

# host_cpu_usage（Host侧CPU利用率）

Host侧CPU利用率数据在msprof_*.json文件的CPU Usage层级展示，summary信息在host_cpu_usage_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的CPU Usage层级数据说明

msprof_*.json文件CPU Usage层级数据如下图所示。

**图1** CPU Usage层
![](figure/zh-cn_image_0000002502558680.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| CPU _< id>_ | CPU ID。 |
| CPU Avg | CPU平均利用率。 |
| usage | 利用率。 |


#### host_cpu_usage_*.csv文件说明

host_cpu_usage_*.csv文件内容格式示例如下：

**图2** host_cpu_usage_*.csv
![](figure/zh-cn_image_0000002534478541.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Total Cpu Numbers | 系统CPU总核数。 |
| Occupied Cpu Numbers | 进程占用的CPU核数。 |
| Recommend Cpu Numbers | 使用中的CPU核数，虚拟化场景中为CPU核数资源的推荐分配值。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
