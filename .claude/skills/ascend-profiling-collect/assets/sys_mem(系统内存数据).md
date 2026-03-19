<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0080.html -->

# sys_mem（系统内存数据）

系统内存数据无timeline信息，summary信息在sys_mem_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### sys_mem_*.csv文件数据说明

sys_mem_*.csv文件内容格式示例如下：

**图1** sys_mem_*.csv
![](figure/zh-cn_image_0000002502558782.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Memory Total(kB) | 系统总内存，单位kB。 |
| Memory Free(kB) | 系统内存剩余，单位kB。 |
| Buffers(kB) | 内存缓冲区大小，单位kB。 |
| Cached(kB) | 高速缓冲存储器使用大小，单位kB。 |
| Share Memory(kB) | 共享内存，单位kB。 |
| Commit Limit(kB) | 虚拟内存限值，单位kB。 |
| Committed AS(kB) | 系统已经分配的内存，单位kB。 |
| Huge Pages Total(pages) | 系统大内存页（huge page）总数。 |
| Huge Pages Free(pages) | 系统大内存页（huge page）剩余总数。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
