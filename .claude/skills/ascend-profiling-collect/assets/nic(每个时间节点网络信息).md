<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0087.html -->

# nic（每个时间节点网络信息）

每个时间节点网络信息数据timeline信息在msprof_*.json文件的NIC层级展示，summary信息在nic_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的NIC层级数据说明

msprof_*.json文件NIC层数据如下图所示。

**图1** NIC层
![](figure/zh-cn_image_0000002502558670.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Tx/Rx Dropped Rate | 发送/接收包丢包率。 |
| Tx/Rx Error Rate | 发送/接收包错误率。 |
| Tx/Rx Packets | 发送/接收包速率。 |
| Tx/Rx Bandwidth Efficiency | 发送/接收包带宽利用率。 |


#### nic_*.csv文件说明

nic_*.csv文件内容格式示例如下：

**图2** nic_*.csv
![](figure/zh-cn_image_0000002534478531.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Timestamp(us) | 时间节点，单位us。 |
| Bandwidth(MB/s) | 带宽大小，单位MB/s。 |
| Rx Bandwidth efficiency(%) | 接收包带宽利用率。 |
| rxPacket/s | 每秒接收包速率。 |
| rxError rate(%) | 接收包错误率。 |
| rxDropped rate(%) | 接收包丢包率。 |
| Tx Bandwidth efficiency(%) | 发送包带宽利用率。 |
| txPacket/s | 每秒发送包速率。 |
| txError rate(%) | 发送包错误率。 |
| txDropped rate(%) | 发送包丢包率。 |
| funcId | 网络节点。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
