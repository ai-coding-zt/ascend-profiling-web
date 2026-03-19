<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0071.html -->

# aicpu（AI CPU算子详细耗时）

aicpu算子详细耗时数据无timeline信息，summary信息在aicpu_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### aicpu_*.csv文件说明

AI CPU数据aicpu_*.csv文件内容格式示例如下：

**图1** aicpu_*.csv
![](figure/zh-cn_image_0000002534478543.png)

该文件采集的是数据预处理上报的AI CPU数据，其他涉及AI CPU数据的文件采集的是全量AI CPU数据。

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Timestamp(us) | 事件的时间戳。 |
| Node | 任务的节点名。 |
| Compute_time(us) | 计算耗时，单位us。 |
| Memcpy_time(us) | 内存拷贝耗时，单位us。 |
| Task_time(us) | AICPU算子执行时间，包括算子预处理、计算耗时、内存拷贝耗时，单位us。 |
| Dispatch_time(us) | 分发耗时，单位us。 |
| Total_time(us) | 从内核态记录的Task开始和结束的时间，包含了Dispatch_time、AICPU框架调度时间和AICPU算子执行时间，单位us。 |
| Stream ID | 该Task所处的Stream ID。 |
| Task ID | Task任务的ID。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
