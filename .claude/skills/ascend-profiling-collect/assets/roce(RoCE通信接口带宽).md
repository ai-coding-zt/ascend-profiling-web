<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0088.html -->

# roce（RoCE通信接口带宽）

RoCE通信接口带宽数据timeline信息在msprof_*.json文件的RoCE层级展示，summary信息在roce_*.csv文件汇总。

#### 支持的型号

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的RoCE层级数据说明

msprof_*.json文件RoCE层级数据如下图所示。

**图1** RoCE层
![](figure/zh-cn_image_0000002502718566.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Tx/Rx_Dropped_Rate | 发送/接收包丢包率。 |
| Tx/Rx_Error_Rate | 发送/接收包错误率。 |
| Tx/Rx_Packets | 每秒发送/接收包速率。 |
| Tx/Rx_Bandwidth_Efficiency | 发送/接收包带宽利用率。 |


#### roce_*.csv文件说明

roce_*.csv文件内容格式示例如下：

**图2** roce_*.csv
![](figure/zh-cn_image_0000002534398569.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Timestamp(us) | 时间戳，单位us。 |
| Bandwidth(MB/s) | 带宽大小，单位MB/s。 |
| Rx Bandwidth efficiency(%) | 接收包带宽利用率。 |
| rxPacket/s | 每秒接收包速率。 |
| rxError rate(%) | 接收包错误率。 |
| rxDropped rate(%) | 接收包丢包率。 |
| Tx Bandwidth efficiency(%) | 发送包带宽利用率。 |
| txPacket/s | 每秒发送包速率。 |
| txError rate(%) | 发送包错误率。 |
| txDropped rate(%) | 发送包丢包率。 |
| funcId | 端口ID，用于区分一个Device中的多个端口。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
