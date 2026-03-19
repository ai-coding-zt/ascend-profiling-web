<!-- source: https://www.hiascend.com/document/detail/zh/canncommercial/850/devaids/Profiling/atlasprofiling_16_0067.html -->

# op_summary（算子详细信息）

AI Core、AI Vector Core和AI CPU算子汇总信息无timeline信息，summary信息在op_summary_*.csv文件汇总，用于统计算子的具体信息和耗时情况。

#### 支持的型号

Atlas 200I/500 A2 推理产品

Atlas 推理系列产品

Atlas 训练系列产品

Atlas A2 训练系列产品 / Atlas A2 推理系列产品

Atlas A3 训练系列产品 / Atlas A3 推理系列产品

#### op_summary_*.csv文件说明

op_summary_*.csv文件内容格式示例如下：

**图1** op_summary（仅为示例）
![](figure/zh-cn_image_0000002534478487.png)

Task Duration字段为算子耗时信息，可以按照Task Duration排序，找出高耗时算子；也可以按照Task Type排序，查看AI Core或AI CPU上运行的高耗时算子。

  * 下文字段说明中，不同产品支持的字段略有不同，请以实际结果文件呈现字段为准。
  * task_time配置为l0或off时，op_summary_*.csv不呈现AI Core、AI Vector Core的PMU数据。
  * Atlas A2 训练系列产品 / Atlas A2 推理系列产品 ：MatMul算子的输入a、b矩阵满足：内轴大于1000，MAC理论计算耗时大于50us，内轴大小非516B对齐时，MatMul会转化为MIX算子，此时op_summary.csv中的MatMul算子数量减少且Task Type由原来的AI_Core转变为MIX_AIC。
  * Atlas A3 训练系列产品 / Atlas A3 推理系列产品 ：MatMul算子的输入a、b矩阵满足：内轴大于1000，MAC理论计算耗时大于50us，内轴大小非516B对齐时，MatMul会转化为MIX算子，此时op_summary.csv中的MatMul算子数量减少且Task Type由原来的AI_Core转变为MIX_AIC。
  * 对于部分算子，执行时间过长，导致metric相关数据失准，不再具有参考意义，此类数据统一置为N/A，不做相关呈现。
  * 由于Task Type为communication类型的算子通常包含一系列通信任务，每个通信任务均有独立的Task ID和Stream ID等标识，此处不作展示，因此该类算子的Task ID和Stream ID为N/A。
  * 算子的输入维度Input Shapes取值为空，即表示为“; ; ; ;”格式时，表示当前输入的为标量，其中“;”为每个维度的分隔符。算子的输出维度同理。
  * 工具会检测算子溢出情况，若发现算子溢出，则提示如下告警，此时该算子的计算结果不可信。

**图2** 算子溢出告警
![](figure/zh-cn_image_0000002502718454.png)


op_summary_*.csv文件根据参数取值不同，文件呈现结果不同。完整字段如下。

**表1** 公共字段说明

| 字段名 | 字段含义 |
| --- | --- |
| Device_id | 设备ID。 |
| Model Name | 模型名称。如果Model Name值为空，则可能由于获取的数据中该值为空。（默认情况下或单算子场景不显示该字段） |
| Model ID | 模型ID。 |
| Task ID | Task任务的ID。 |
| Stream ID | 该Task所处的Stream ID。 |
| Infer ID | 标识第几轮推理数据。（默认情况下或单算子场景不显示该字段） |
| Op Name | 算子名称。 |
| OP Type | 算子类型。task_time为l0时，不采集该字段，显示为N/A。 |
| OP State | 算子的动静态信息，dynamic表示动态算子，static表示静态算子，通信算子无该状态显示为N/A，该字段仅在--task-time=l1情况下上报，--task-time=l0时显示为N/A。 |
| Task Type | 执行该Task的加速器类型，包含AI_CORE、AI_VECTOR_CORE、AI_CPU等。task_time为l0时，不采集该字段，显示为N/A。 |
| Task Start Time(us) | Task开始时间，单位us。 |
| Task Duration(us) | Task耗时，包含调度到加速器的时间、加速器上的执行时间以及结束响应时间，单位us。 |
| Task Wait Time(us) | 上一个Task的结束时间与当前Task的开始时间间隔，单位us。 |
| Block Dim | Task运行切分数量，对应Task运行时核数。task_time为l0时，不采集该字段，显示为0。 |
| HF32 Eligible | 标识是否使用HF32精度标记，YES表示使用，NO表示未使用，该字段仅在--task-time=l1情况下上报，--task-time=l0时显示为N/A。 |
| Mix Block Dim | 部分算子同时在AI Core和Vector Core上执行，主加速器的Block Dim在Block Dim字段描述，从加速器的Block Dim在本字段描述。task_time为l0时，不采集该字段，显示为N/A。（ Atlas 200I/500 A2 推理产品 ）（ Atlas A2 训练系列产品 / Atlas A2 推理系列产品 ）（ Atlas A3 训练系列产品 / Atlas A3 推理系列产品 ） |
| Input Shapes | 算子的输入维度。task_time为l0时，不采集该字段，显示为N/A。 |
| Input Data Types | 算子输入数据类型。task_time为l0时，不采集该字段，显示为N/A。 |
| Input Formats | 算子输入数据格式。task_time为l0时，不采集该字段，显示为N/A。 |
| Output Shapes | 算子的输出维度。task_time为l0时，不采集该字段，显示为N/A。 |
| Output Data Types | 算子输出数据类型。task_time为l0时，不采集该字段，显示为N/A。 |
| Output Formats | 算子输出数据格式。task_time为l0时，不采集该字段，显示为N/A。 |
| Context ID | Context ID，用于标识Sub Task粒度的小算子，不存在小算子时显示为N/A。（ Atlas 200I/500 A2 推理产品 ）（ Atlas A2 训练系列产品 / Atlas A2 推理系列产品 ）（ Atlas A3 训练系列产品 / Atlas A3 推理系列产品 ） |
| aiv_time(us) | 当所有的Block被同时调度，且每个Block的执行时长相等时，该Task在AI Vector Core上的理论执行时间，单位us。通常情况下，不同的Block开始调度时间略有差距，故该字段值略小于Task在AI Vector Core上的实际执行时间。（ Atlas A2 训练系列产品 / Atlas A2 推理系列产品 ）（ Atlas A3 训练系列产品 / Atlas A3 推理系列产品 ） \--task-time=l1、--aic-mode=task-based时生成。 |
| aicore_time(us) | 当所有的Block被同时调度，且每个Block的执行时长相等时，该Task在AI Core上的理论执行时间，单位us。通常情况下，不同的Block开始调度时间略有差距，故该字段值略小于Task在AI Core上的实际执行时间。 当AI Core频率变化（比如进行手动调频、功耗超出阈值时动态调频以及Atlas 300V/Atlas 300I Pro产品）时该数据不准确，不建议参考。 Atlas 200I/500 A2 推理产品 ：具体频率变化点请参考[查看AI Core频率](atlasprofiling_16_0059.html#ZH-CN_TOPIC_0000002534478467__section9194165318231)。 Atlas A2 训练系列产品 / Atlas A2 推理系列产品 ：具体频率变化点请参考[查看AI Core频率](atlasprofiling_16_0059.html#ZH-CN_TOPIC_0000002534478467__section9194165318231)。 Atlas A3 训练系列产品 / Atlas A3 推理系列产品 ：具体频率变化点请参考[查看AI Core频率](atlasprofiling_16_0059.html#ZH-CN_TOPIC_0000002534478467__section9194165318231)。 \--task-time=l1、--aic-mode=task-based时生成。 |
| total_cycles | 该Task在AI Core上执行的cycle总数，由所有的Block的执行cycle数累加而成。 \--task-time=l1、--aic-mode=task-based时生成。 对于 Atlas 200I/500 A2 推理产品 拆分为aic_total_cycles（该Task在AI Cube Core上执行的cycle总数）和aiv_total_cycles（该Task在AI Vector Core上执行的cycle总数）。 对于 Atlas A2 训练系列产品 / Atlas A2 推理系列产品 拆分为aic_total_cycles（该Task在AI Cube Core上执行的cycle总数）和aiv_total_cycles（该Task在AI Vector Core上执行的cycle总数）。 对于 Atlas A3 训练系列产品 / Atlas A3 推理系列产品 拆分为aic_total_cycles（该Task在AI Cube Core上执行的cycle总数）和aiv_total_cycles（该Task在AI Vector Core上执行的cycle总数）。 |
| 寄存器值 | 自定义采集的寄存器的数值。由--aic-metrics配置自定义寄存器控制。 |


下列字段均在--task-time=l1、--aic-mode=task-based时生成，--task-time为l0时，不采集该字段，显示为N/A。生成的数据由aic_metrics参数取值控制。

**表2** 字段说明（PipeUtilization）

| 字段名 | 字段含义 |
| --- | --- |
| *_vec_time(us) | vec类型指令（向量类运算指令）耗时，单位us。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_vec_ratio | vec类型指令（向量类运算指令）的cycle数在total cycle数中的占用比。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_mac_time(us) | cube类型指令（矩阵类运算指令）耗时，单位us。 |
| *_mac_ratio | cube类型指令（矩阵类运算指令）的cycle数在total cycle数中的占用比。 |
| *_scalar_time(us) | scalar类型指令（标量类运算指令）耗时，单位us。 |
| *_scalar_ratio | scalar类型指令（标量类运算指令）的cycle数在total cycle数中的占用比。 |
| aic_fixpipe_time(us) | fixpipe类型指令（L0C->OUT/L1搬运类指令）耗时，单位us。 |
| aic_fixpipe_ratio | fixpipe类型指令（L0C->OUT/L1搬运类指令）的cycle数在total cycle数中的占用比。 |
| *_mte1_time(us) | mte1类型指令（L1->L0A/L0B搬运类指令）耗时，单位us。 |
| *_mte1_ratio | mte1类型指令（L1->L0A/L0B搬运类指令）的cycle数在total cycle数中的占用比。 |
| *_mte2_time(us) | mte2类型指令（DDR->AICORE搬运类指令）耗时，单位us。 |
| *_mte2_ratio | mte2类型指令（DDR->AICORE搬运类指令）的cycle数在total cycle数中的占用比。 |
| *_mte3_time(us) | mte3类型指令（AICORE->DDR搬运类指令）耗时，单位us。 |
| *_mte3_ratio | mte3类型指令（AICORE->DDR搬运类指令）的cycle数在total cycle数中的占用比。 |
| *_icache_miss_rate | icache是为instruction预留的L2 Cache，icache_miss_rate数值高代表AI Core读取指令的效率低。 |
| memory_bound | 用于识别AICore执行算子计算过程是否存在Memory瓶颈，由mte2_ratio/max(mac_ratio, vec_ratio)计算得出。计算结果小于1，表示没有Memory瓶颈；计算结果大于1则表示AI Core在执行Task过程中大部分时间都在做内存搬运而不是计算，且数值越大Memory瓶颈越严重。 |
| cube_utilization(%) | cube算子利用率，查看cube算子在单位时间内的运算次数是否达到理论上限，越接近于100%则表示越接近理论上限。计算公式：cube_utilization=total_cycles / (freq * core_num * task_duration)。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表3** 字段说明（ArithmeticUtilization）

| 字段名 | 字段含义 |
| --- | --- |
| *_mac_fp16_ratio | cube fp16类型指令的cycle数在total cycle数中的占用比。 |
| *_mac_int8_ratio | cube int8类型指令的cycle数在total cycle数中的占用比。 |
| *_vec_fp32_ratio | vec fp32类型指令的cycle数在total cycle数中的占用比。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_vec_fp16_ratio | vec fp16类型指令的cycle数在total cycle数中的占用比。 |
| *_vec_int32_ratio | vec int32类型指令的cycle数在total cycle数中的占用比。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_vec_misc_ratio | vec misc类型指令的cycle数在total cycle数中的占用比。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_cube_fops | cube类型的浮点运算数，即计算量，可用于衡量算法/模型的复杂度，其中fops表示floating point operations，缩写为FLOPs。 |
| *_vector_fops | vector类型浮点运算数，即计算量，可用于衡量算法/模型的复杂度，其中fops表示floating point operations，缩写为FLOPs。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表4** 字段说明（Memory）

| 字段名 | 字段含义 |
| --- | --- |
| *_ub_read_bw(GB/s) | ub读带宽速率，单位GB/s。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_ub_write_bw(GB/s) | ub写带宽速率，单位GB/s。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_l1_read_bw(GB/s) | l1读带宽速率，单位GB/s。 |
| *_l1_write_bw(GB/s) | l1写带宽速率，单位GB/s。 |
| *_l2_read_bw | l2读带宽速率，单位GB/s。 |
| *_l2_write_bw | l2写带宽速率，单位GB/s。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_main_mem_read_bw(GB/s) | 主存储器读带宽速率，单位GB/s。 |
| *_main_mem_write_bw(GB/s) | 主存储器写带宽速率，单位GB/s。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表5** 字段说明（MemoryL0）

| 字段名 | 字段含义 |
| --- | --- |
| *_l0a_read_bw(GB/s) | l0a读带宽速率，单位GB/s。 |
| *_l0a_write_bw(GB/s) | l0a写带宽速率，单位GB/s。 |
| *_l0b_read_bw(GB/s) | l0b读带宽速率，单位GB/s。 |
| *_l0b_write_bw(GB/s) | l0b写带宽速率，单位GB/s。 |
| *_l0c_read_bw(GB/s) | vector从l0c读带宽速率，单位GB/s。 |
| *_l0c_write_bw(GB/s) | vector向l0c写带宽速率，单位GB/s。 |
| *_l0c_read_bw_cube(GB/s) | cube从l0c读带宽速率，单位GB/s。 |
| *_l0c_write_bw_cube(GB/s) | cube向l0c写带宽速率，单位GB/s。 注：采集AI Vector Core的MemoryL0性能指标时，采集到的数据都为0。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表6** 字段说明（MemoryUB）

| 字段名 | 字段含义 |
| --- | --- |
| *_ub_read_bw_vector(GB/s) | vector从ub读带宽速率，单位GB/s。 |
| *_ub_write_bw_vector(GB/s) | vector向ub写带宽速率，单位GB/s。 |
| *_ub_read_bw_scalar(GB/s) | scalar从ub读带宽速率，单位GB/s。 |
| *_ub_write_bw_scalar(GB/s) | scalar向ub写带宽速率，单位GB/s。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表7** 字段说明（ResourceConflictRatio）

| 字段名 | 字段含义 |
| --- | --- |
| *_vec_bankgroup_cflt_ratio | vec_bankgroup_stall_cycles类型指令执行cycle数在total cycle数中的占用比。由于vector指令的block stride的值设置不合理，造成bankgroup冲突。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_vec_bank_cflt_ratio | vec_bank_stall_cycles类型指令执行cycle数在total cycle数中的占用比。由于vector指令操作数的读写指针地址不合理，造成bank冲突。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| *_vec_resc_cflt_ratio | vec_resc_cflt_ratio类型指令执行cycle数在total cycle数中的占用比。当算子中涉及多个计算单元，应该尽量保证多个单元并发调度。当某个计算单元正在执行计算，但算子逻辑仍然往该单元下发指令，就会造成整体的算力没有得到充分应用。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。|


**表8** 字段说明（MemoryAccess）

| 字段名 | 字段含义 |
| --- | --- |
| *_read_main_memory_datas(KB) | 对片上内存读的数据量，单位KB。 |
| *_write_main_memory_datas(KB) | 对片上内存写的数据量，单位KB。 |
| *_GM_to_L1_datas(KB) | GM到L1的数据搬运量，单位KB。 |
| *_L0C_to_L1_datas(KB) | L0C到L1的数据搬运量，单位KB。 |
| *_L0C_to_GM_datas(KB) | L0C到GM的数据搬运量，单位KB。 |
| *_GM_to_UB_datas(KB) | GM到UB的数据搬运量，单位KB。 |
| *_UB_to_GM_datas(KB) | UB到GM的数据搬运量，单位KB。 注：上表中字段的*前缀，指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。 仅支持产品： Atlas A2 训练系列产品 / Atlas A2 推理系列产品  Atlas A3 训练系列产品 / Atlas A3 推理系列产品|


**表9** 字段说明（L2Cache）

| 字段名 | 字段含义 |
| --- | --- |
| *_write_cache_hit | 写cache命中的次数。 |
| *_write_cache_miss_allocate | 写cache缺失后重新分配缓存的次数。 |
| *_r*_read_cache_hit | 读r*通道cache命中次数。 |
| *_r*_read_cache_miss_allocate | 读r*通道cache缺失后重新分配的次数。 注：对于部分产品，部分字段在该表中使用*前缀指代aic或aiv，表示该数据是在Cube Core或Vector Core上执行的结果。 仅支持产品： Atlas A2 训练系列产品 / Atlas A2 推理系列产品  Atlas A3 训练系列产品 / Atlas A3 推理系列产品  Atlas 200I/500 A2 推理产品|


**表10** 字段说明（PipelineExecuteUtilization）

| 字段名 | 字段含义 |
| --- | --- |
| vec_exe_time(us) | vec类型指令（向量类运算指令）耗时，单位us。 |
| vec_exe_ratio | vec类型指令（向量类运算指令）的cycle数在total cycle数中的占用比。 Atlas 200I/500 A2 推理产品 不支持该字段，给予默认值N/A。 |
| mac_exe_time(us) | cube类型指令（fp16及s16矩阵类运算指令）耗时，单位us。 |
| mac_exe_ratio | cube类型指令（fp16及s16矩阵类运算指令）的cycle数在total cycle数中的占用比。 |
| scalar_exe_time(us) | scalar类型指令（标量类运算指令）耗时，单位us。 |
| scalar_exe_ratio | scalar类型指令（标量类运算指令）的cycle数在total cycle数中的占用比。 |
| mte1_exe_time(us) | mte1类型指令（L1->L0A/L0B搬运类指令）耗时，单位us。 |
| mte1_exe_ratio | mte1类型指令（L1->L0A/L0B搬运类指令）的cycle数在total cycle数中的占用比。 |
| mte2_exe_time(us) | mte2类型指令（DDR->AICORE搬运类指令）耗时，单位us。 |
| mte2_exe_ratio | mte2类型指令（DDR->AICORE搬运类指令）的cycle数在total cycle数中的占用比。 |
| mte3_exe_time(us) | mte3类型指令（AICORE->DDR搬运类指令）耗时，单位us。 |
| mte3_exe_ratio | mte3类型指令（AICORE->DDR搬运类指令）的cycle数在total cycle数中的占用比。 |
| fixpipe_exe_time(us) | fixpipe类型指令（L0C->OUT/L1搬运类指令）耗时，单位us。 |
| fixpipe_exe_ratio | fixpipe类型指令（L0C->OUT/L1搬运类指令）的cycle数在total cycle数中的占用比。 |
| memory_bound | 用于识别AICore执行算子计算过程是否存在Memory瓶颈，由mte2_ratio/max(mac_ratio, vec_ratio)计算得出。计算结果小于1，表示没有Memory瓶颈；计算结果大于1则表示AI Core在执行Task过程中大部分时间都在做内存搬运而不是计算，且数值越大Memory瓶颈越严重。 |
| cube_utilization(%) | cube算子利用率，查看cube算子在单位时间内的运算次数是否达到理论上限，越接近于100%则表示越接近理论上限。计算公式：cube_utilization=total_cycles / (freq * core_num * task_duration)。 |


**父主题：** [性能数据文件参考](atlasprofiling_16_0056.html)
