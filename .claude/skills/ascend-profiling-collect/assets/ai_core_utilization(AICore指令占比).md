<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0069.html -->

# ai_core_utilization（AI Core指令占比）

AI Core指令占比数据timeline信息在msprof_*.json文件的AI Core Utilization层级展示，summary信息在ai_core_utilization_*.csv文件汇总。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品/Atlas A2 推理系列产品

Atlas A3 训练系列产品/Atlas A3 推理系列产品

#### msprof_*.json文件的AI Core指令占比数据说明

msprof_*.json文件内容格式示例如下：

**图1** AI Core Utilization层
![](figure/zh-cn_image_0000002502718514.png)

**表1** 字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Average | 均值。 |
| Core _< ID>_ | Core ID。 |
| utilization(%) | 当前采样周期内，AI Core在执行Task的total cycle（从AI Core开始执行算子的第一条指令开始计数，到最后一条指令执行完成）占比。 |


#### ai_core_utilization_*.csv文件说明

ai_core_utilization_*.csv文件内容格式示例如下：

**图2** ai_core_utilization（仅为示例）
![](figure/zh-cn_image_0000002534398523.png)

根据--aic-metrics参数取值不同，文件呈现结果不同。完整字段如下。

  * 下文字段说明中，不同产品支持的字段略有不同，请以实际结果文件呈现字段为准。
  * 下列字段均在--task-time=l1、--aic-mode=sample-based时生成，--task-time为l0时，不采集该字段，显示为N/A。生成的数据由aic_metrics参数取值控制。


**表2** 字段说明（PipeUtilization）

| 字段名 | 字段含义 |
| --- | --- |
| vec_ratio | vec类型指令（向量类运算指令）的cycle数在total cycle数中的占用比。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。Atlas A2 训练系列产品/Atlas A2 推理系列产品不支持该字段。Atlas A3 训练系列产品/Atlas A3 推理系列产品不支持该字段。 |
| mac_ratio | cube类型指令（矩阵类运算指令）的cycle数在total cycle数中的占用比。 |
| scalar_ratio | scalar类型指令（标量类运算指令）的cycle数在total cycle数中的占用比。 |
| mte1_ratio | mte1类型指令（L1->L0A/L0B搬运类指令）的cycle数在total cycle数中的占用比。 |
| mte2_ratio | mte2类型指令（DDR->AICORE搬运类指令）的cycle数在total cycle数中的占用比。 |
| mte3_ratio | mte3类型指令（AICORE->DDR搬运类指令）的cycle数在total cycle数中的占用比。Atlas A2 训练系列产品/Atlas A2 推理系列产品不支持该字段。Atlas A3 训练系列产品/Atlas A3 推理系列产品不支持该字段。 |
| icache_miss_rate | icache是为instruction预留的L2 Cache，icache_miss_rate数值高代表AI Core读取指令的效率低。 |
| fixpipe_ratio | fixpipe类型指令（L0C->OUT/L1搬运类指令）的cycle数在total cycle数中的占用比。 |
| memory_bound | 用于识别AICore执行算子计算过程是否存在Memory瓶颈，由mte2_ratio/max(mac_ratio, vec_ratio)计算得出。计算结果小于1，表示没有Memory瓶颈；计算结果大于1则表示AI Core在执行Task过程中大部分时间都在做内存搬运而不是计算，且数值越大Memory瓶颈越严重。Atlas A2 训练系列产品/Atlas A2 推理系列产品不支持该字段。Atlas A3 训练系列产品/Atlas A3 推理系列产品不支持该字段。 |


**表3** 字段说明（ArithmeticUtilization）

| 字段名 | 字段含义 |
| --- | --- |
| mac_fp16_ratio | cube fp16类型指令的cycle数在total cycle数中的占用比。 |
| mac_int8_ratio | cube int8类型指令的cycle数在total cycle数中的占用比。 |
| vec_fp32_ratio | vec fp32类型指令的cycle数在total cycle数中的占用比。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| vec_fp16_ratio | vec fp16类型指令的cycle数在total cycle数中的占用比。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| vec_int32_ratio | vec int32类型指令的cycle数在total cycle数中的占用比。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| vec_misc_ratio | vec misc类型指令的cycle数在total cycle数中的占用比。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| cube_fops | cube类型的浮点运算数，即计算量，可用于衡量算法/模型的复杂度，其中fops表示floating point operations，缩写为FLOPs。 |
| vector_fops | vector类型浮点运算数，即计算量，可用于衡量算法/模型的复杂度，其中fops表示floating point operations，缩写为FLOPs。 |


**表4** 字段说明（Memory）

| 字段名 | 字段含义 |
| --- | --- |
| ub_read_bw(GB/s) | ub读带宽速率，单位GB/s。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| ub_write_bw(GB/s) | ub写带宽速率，单位GB/s。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| l1_read_bw(GB/s) | l1读带宽速率，单位GB/s。 |
| l1_write_bw(GB/s) | l1写带宽速率，单位GB/s。 |
| l2_read_bw | l2读带宽速率，单位GB/s。 |
| l2_write_bw | l2写带宽速率，单位GB/s。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| main_mem_read_bw(GB/s) | 主存储器读带宽速率，单位GB/s。 |
| main_mem_write_bw(GB/s) | 主存储器写带宽速率，单位GB/s。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。不支持该字段，给予默认值N/A。 |


**表5** 字段说明（MemoryL0）

| 字段名 | 字段含义 |
| --- | --- |
| l0a_read_bw(GB/s) | l0a读带宽速率，单位GB/s。 |
| l0a_write_bw(GB/s) | l0a写带宽速率，单位GB/s。 |
| l0b_read_bw(GB/s) | l0b读带宽速率，单位GB/s。 |
| l0b_write_bw(GB/s) | l0b写带宽速率，单位GB/s。 |
| l0c_read_bw(GB/s) | vector从l0c读带宽速率，单位GB/s。 |
| l0c_write_bw(GB/s) | vector向l0c写带宽速率，单位GB/s。 |
| l0c_read_bw_cube(GB/s) | cube从l0c读带宽速率，单位GB/s。 |
| l0c_write_bw_cube(GB/s) | cube向l0c写带宽速率，单位GB/s。 |

注：采集AI Vector Core的MemoryL0性能指标时，采集到的数据都为0。

**表6** 字段说明（MemoryUB）

| 字段名 | 字段含义 |
| --- | --- |
| ub_read_bw_vector(GB/s) | vector从ub读带宽速率，单位GB/s。 |
| ub_write_bw_vector(GB/s) | vector向ub写带宽速率，单位GB/s。 |
| ub_read_bw_scalar(GB/s) | scalar从ub读带宽速率，单位GB/s。 |
| ub_write_bw_scalar(GB/s) | scalar向ub写带宽速率，单位GB/s。 |


**表7** 字段说明（ResourceConflictRatio）

| 字段名 | 字段含义 |
| --- | --- |
| vec_bankgroup_cflt_ratio | vec_bankgroup_stall_cycles类型指令执行cycle数在total cycle数中的占用比。由于vector指令的block stride的值设置不合理，造成bankgroup冲突。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| vec_bank_cflt_ratio | vec_bank_stall_cycles类型指令执行cycle数在total cycle数中的占用比。由于vector指令操作数的读写指针地址不合理，造成bank冲突。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |
| vec_resc_cflt_ratio | vec_resc_cflt_ratio类型指令执行cycle数在total cycle数中的占用比。当算子中涉及多个计算单元，应该尽量保证多个单元并发调度。当某个计算单元正在执行计算，但算子逻辑仍然往该单元下发指令，就会造成整体的算力没有得到充分应用。Atlas 200I/500 A2 推理产品不支持该字段，给予默认值N/A。 |


**表8** 字段说明（L2Cache）

| 字段名 | 字段含义 |
| --- | --- |
| write_cache_hit | 写cache命中的次数。 |
| write_cache_miss_allocate | 写cache缺失后重新分配缓存的次数。 |
| r*_read_cache_hit | 读r*通道cache命中次数。 |
| r*_read_cache_miss_allocate | 读r*通道cache缺失后重新分配的次数。 |
| read_local_l2_hit | 读Cache命中的次数。 |
| read_local_l2_miss | 读Cache缺失次数。 |
| read_local_l2_victim | 读Cache未命中并触发Cache中数据被换出的次数。 |
| write_local_l2_hit | 写Cache命中的次数。 |
| write_local_l2_miss | 写Cache缺失次数。 |
| write_local_l2_victim | 写Cache未命中并触发Cache中数据被换出的次数。 |

仅支持产品： Atlas A2 训练系列产品/Atlas A2 推理系列产品 Atlas A3 训练系列产品/Atlas A3 推理系列产品 Atlas 200I/500 A2 推理产品

**表9** 字段说明（MemoryAccess）

| 字段名 | 字段含义 |
| --- | --- |
| read_main_memory_datas(KB) | 对片上内存读的数据量，单位KB。 |
| write_main_memory_datas(KB) | 对片上内存写的数据量，单位KB。 |
| gm_to_l1_datas(KB) | GM到L1的数据搬运量，单位KB。 |
| l0c_to_l1_datas(KB) | L0C到L1的数据搬运量，单位KB。 |
| l0c_to_gm_datas(KB) | L0C到GM的数据搬运量，单位KB。 |
| gm_to_ub_datas(KB) | GM到UB的数据搬运量，单位KB。 |
| ub_to_gm_datas(KB) | UB到GM的数据搬运量，单位KB。 |

仅支持产品： Atlas A2 训练系列产品/Atlas A2 推理系列产品 Atlas A3 训练系列产品/Atlas A3 推理系列产品

**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
