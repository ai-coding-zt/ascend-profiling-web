<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0110.html -->

# os_runtime_statistic（Host侧syscall和pthreadcall）

Host侧syscall和pthreadcall数据timeline信息在msprof_*.json文件的OS Runtime API层级展示，summary信息在os_runtime_statistic_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的OS Runtime API层级数据说明

msprof_*.json文件OS Runtime API层级数据如下图所示。

**图1** OS Runtime API层
![](figure/zh-cn_image_0000002534478495.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Title | 选择某个组件的接口名称，例如本例选择的为pthread_mutex_unlock接口。 |
| Start | 显示界面中时间轴上的时刻点，chrome trace自动对齐，单位ms。 |
| Wall Duration | 表示当前接口调用耗时，单位ms。 |


#### os_runtime_statistic_*.csv文件说明

os_runtime_statistic_*.csv文件内容格式示例如下：

**图2** os_runtime_statistic_*.csv
![](figure/zh-cn_image_0000002534398475.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。Host侧数据时显示为host。 |
| Process ID | 进程ID。 |
| Thread ID | 线程ID。 |
| Name | API接口名称。 |
| Time(%) | 该接口耗时占比。 |
| Time(us) | 该接口总耗时，单位us。 |
| Count | 该接口调用次数。 |
| Avg(us)、Max(us)、Min(us) | 该接口调用平均耗时、最大耗时、最小耗时，单位us。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
