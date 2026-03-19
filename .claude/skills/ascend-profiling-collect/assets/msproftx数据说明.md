<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0061.html -->

# msproftx数据说明

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### 总体说明

msproftx采集的是用户和上层框架程序输出性能数据，数据保存在mindstudio_profiler_output目录下。

相关数据如表1所示。

**表1** 数据文件介绍文件名 | 说明
msprof_*.json | timeline汇总数据。详情请参见msproftx timeline汇总数据。
msprof_tx_*.json | msproftx timeline数据。为msprof_*.json的子集。详情请参见msproftx timeline数据。
msprof_tx_*.csv | msproftx summary数据。对采集到的Host msproftx summary数据按线程进行拼接，并进行数据关联性展示。详情请参见msprof_tx summary数据。

#### msproftx timeline汇总数据

msproftx的timeline汇总数据在msprof_*.json的上层应用层级展示，如图1所示。其他层级及含义请参见[msprof（timeline数据总表）](atlasprofiling_16_0059.html)。

**图1** timeline汇总数据
![](figure/zh-cn_image_0000002534478517.png)

#### msproftx timeline数据

msproftx的timeline数据在msprof_tx_*.json展示。如下所示。

**图2** msproftx timeline数据
![](figure/zh-cn_image_0000002502558658.png)

如图2所示，timeline汇总数据主要展示如下区域：

  * 区域1：msproftx打点，记录上层应用数据，包含上层应用运行的耗时信息。
  * 区域2：底层NPU数据，msproftx打点下发至Device侧的耗时记录。
  * 区域3：展示timeline中各算子、接口的详细信息。单击各个timeline时展示。


#### msprof_tx summary数据

msprof_tx summary数据文件为msprof_tx_*.csv。

msprof_tx_*.csv文件内容格式示例如下：

**图3** msprof_tx summary数据
![](figure/zh-cn_image_0000002534478519.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| pid | 进程ID。 |
| tid | Thread ID，AscendCL API所在线程ID。 |
| category | Profiling msproftx采集进程类别，用于标识msproftx采集进程的采集内容。（预留字段，暂未开放） |
| event_type | 事件类型。 |
| payload_type | Profiling msproftx采集进程中携带额外的信息Payload的数据类型。（预留字段，暂未开放） |
| payload_value | Profiling msproftx采集进程中携带额外的信息Payload的指针。（预留字段，暂未开放） |
| Start_time(us) | Profiling msproftx采集进程开始时间，单位us。 |
| End_time(us) | Profiling msproftx采集进程结束时间，单位us。 |
| message_type | Profiling msproftx采集进程中携带字符串类型。（预留字段，暂未开放） |
| message | Profiling msproftx采集进程中携带的字符串描述。 |
| domain | 打点所属的domain域。 |
| Device Start_time(us) | Profiling msproftx采集进程在Device侧开始时间，单位us。 |
| Device End_time(us) | Profiling msproftx采集进程在Device侧结束时间，单位us。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
