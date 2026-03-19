<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0089.html -->

# pcie（PCIe带宽）

PCIe带宽数据timeline信息在msprof_*.json文件的PCIe层级展示，summary信息在pcie_*.csv文件汇总。

#### 支持的型号

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的PCIe层级数据说明

msprof_*.json文件PCIe层级数据如下图所示。

**图1** PCIe层
![](figure/zh-cn_image_0000002502558678.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| PCIe_cpl | 接收写请求的完成数据包，单位MB/s。Tx表示发送端，Rx表示接收端。 |
| PCIe_nonpost | PCIe Non-Post数据传输带宽，单位MB/s。Tx表示发送端，Rx表示接收端。 |
| PCIe_nonpost_latency | PCIe Non-Post模式下的传输时延，单位us。Tx表示发送端，Rx表示接收端。PCIe_nonpost_latency无Rx，取固定值0。 |
| PCIe_post | PCIe Post数据传输带宽，单位MB/s。Tx表示发送端，Rx表示接收端。 |


#### pcie_*.csv文件说明

pcie_*.csv文件内容格式示例如下：

**图2** pcie_*.csv
![](figure/zh-cn_image_0000002534478539.png)

**表2** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Mode | 模式，包含： |


  * Tx_p_avg(MB/s)：发送端PCIe Post数据传输带宽，单位MB/s。Tx表示发送端，Rx表示接收端。
  * Tx_np_avg(MB/s)：发送端PCIe Non-Post数据传输带宽，单位MB/s。
  * Tx_cpl_avg(MB/s)：发送端接收写请求的完成数据包，单位MB/s。
  * Tx_latency_avg(us)：发送端PCIe Non-Post模式下的传输时延，单位us。
  * Rx_p_avg(MB/s)：接收端PCIe Post数据传输带宽，单位MB/s。
  * Rx_np_avg(MB/s)：接收端PCIe Non-Post数据传输带宽，单位MB/s。
  * Rx_cpl_avg(MB/s)：接收端接收写请求的完成数据包，单位MB/s。


Min、Max、Avg | 最小值、最大值、平均值。

**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
