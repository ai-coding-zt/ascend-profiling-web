/* ─── ECharts Report Rendering (Theme-Aware) ─── */

(function() {
    const report = window.__REPORT__;
    if (!report) return;

    // ─── Theme-Aware Color Palettes ───
    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function getTextColor() { return isDark() ? '#94A3B8' : '#64748B'; }
    function getAxisColor() { return isDark() ? '#334155' : '#E2E8F0'; }
    function getLabelColor() { return isDark() ? '#F1F5F9' : '#1E293B'; }
    function getBgColor() { return isDark() ? '#1E293B' : '#FFFFFF'; }

    const COLORS = {
        cube: '#4ecdc4',
        vector: '#f39c12',
        mix: '#9b59b6',
        aicpu: '#e74c3c',
        other: '#95a5a6',
    };

    const LABELS = {
        cube: 'AI_CORE (Cube)',
        vector: 'AI_VECTOR',
        mix: 'MIX',
        aicpu: 'AI_CPU',
        other: 'Other',
    };

    // Track all charts for theme re-rendering
    const charts = [];

    function initChart(id, optsFn) {
        const el = document.getElementById(id);
        if (!el) return null;
        const chart = echarts.init(el, null, { renderer: 'canvas' });
        chart.setOption(optsFn());
        window.addEventListener('resize', () => chart.resize());
        charts.push({ chart, optsFn });
        return chart;
    }

    // Re-render all charts on theme change
    window.addEventListener('themechange', () => {
        charts.forEach(({ chart, optsFn }) => {
            chart.setOption(optsFn(), true);
        });
    });

    // Common axis styles (recalculated for theme)
    function axisStyle() {
        return {
            axisLine: { lineStyle: { color: getAxisColor() } },
            axisTick: { lineStyle: { color: getAxisColor() } },
            axisLabel: { color: getTextColor(), fontSize: 11 },
            splitLine: { lineStyle: { color: getAxisColor() } },
        };
    }

    // ─── Pipeline Utilization Detail Table ───
    function renderPipelineTable(pipeOps) {
        const container = document.getElementById('pipeline-detail-table');
        if (!container || !pipeOps || pipeOps.length === 0) return;

        let html = '<table class="data-table"><thead><tr>' +
            '<th>#</th><th>OP Type</th><th>Dtype</th><th>Input Shape</th>' +
            '<th class="num">Mac%</th><th class="num">Vec%</th><th class="num">MTE2%</th>' +
            '<th class="num">Scalar%</th><th>瓶颈</th>' +
            '</tr></thead><tbody>';

        pipeOps.forEach((o, i) => {
            const mac = ((o.mac_ratio || 0) * 100).toFixed(1);
            const vec = ((o.vec_ratio || 0) * 100).toFixed(1);
            const mte2 = ((o.mte2_ratio || 0) * 100).toFixed(1);
            const scalar = ((o.scalar_ratio || 0) * 100).toFixed(1);
            const maxVal = Math.max(o.mac_ratio || 0, o.vec_ratio || 0, o.mte2_ratio || 0);
            const maxUnit = (o.mac_ratio || 0) >= (o.vec_ratio || 0) && (o.mac_ratio || 0) >= (o.mte2_ratio || 0)
                ? 'Mac' : ((o.vec_ratio || 0) >= (o.mte2_ratio || 0) ? 'Vec' : 'MTE2');
            const warn = maxVal < 0.3 ? ' style="color:var(--danger)"' : (maxVal < 0.5 ? ' style="color:var(--warning)"' : '');
            const dtype = (o.dtype || '-').replace('DT_', '');
            const shapes = o.shapes || '-';

            html += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td><code>' + o.type + '</code></td>' +
                '<td>' + dtype + '</td>' +
                '<td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + shapes + '">' + shapes + '</td>' +
                '<td class="num"' + (o.mac_ratio < 0.5 && maxUnit === 'Mac' ? ' style="color:var(--danger)"' : '') + '>' + mac + '</td>' +
                '<td class="num">' + vec + '</td>' +
                '<td class="num">' + mte2 + '</td>' +
                '<td class="num">' + scalar + '</td>' +
                '<td' + warn + '>' + maxUnit + (maxVal < 0.3 ? ' (低)' : '') + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ─── Pie Chart: Cube/Vector Distribution ───
    if (report.op_analysis && report.op_analysis.length > 0) {
        const op = report.op_analysis[0];
        const cv = op.cube_vector;

        const pieData = Object.entries(cv)
            .filter(([_, v]) => v.pct > 0)
            .map(([k, v]) => ({
                name: LABELS[k] || k,
                value: v.pct,
                itemStyle: { color: COLORS[k] || '#ccc' },
            }));

        initChart('chart-pie', () => ({
            tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
            series: [{
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 6, borderColor: getBgColor(), borderWidth: 2 },
                label: { formatter: '{b}\n{c}%', fontSize: 12, color: getTextColor() },
                data: pieData,
            }]
        }));

        // ─── Bar Chart: Type Breakdown ───
        if (op.type_breakdown) {
            const types = op.type_breakdown.slice(0, 12);
            initChart('chart-type-bar', () => ({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: 160, right: 40, top: 20, bottom: 30 },
                xAxis: { type: 'value', name: '耗时占比 (%)', nameTextStyle: { fontSize: 11, color: getTextColor() }, ...axisStyle() },
                yAxis: {
                    type: 'category',
                    data: types.map(t => t.type).reverse(),
                    axisLabel: { fontSize: 11, width: 140, overflow: 'truncate', color: getTextColor() },
                    ...axisStyle(),
                },
                series: [{
                    type: 'bar',
                    data: types.map(t => t.pct).reverse(),
                    itemStyle: { color: '#4ecdc4', borderRadius: [0, 4, 4, 0] },
                    barMaxWidth: 20,
                    label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, color: getTextColor() },
                }]
            }));
        }

        // ─── Dtype Analysis Pie Charts ───
        if (op.dtype_analysis) {
            const dtypeColors = ['#4ecdc4', '#f39c12', '#9b59b6', '#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#95a5a6'];

            if (op.dtype_analysis.by_count) {
                const countData = op.dtype_analysis.by_count
                    .filter(d => d.pct > 0.5)
                    .map((d, i) => ({
                        name: d.dtype.replace('DT_', ''),
                        value: d.pct,
                        itemStyle: { color: dtypeColors[i % dtypeColors.length] },
                    }));
                initChart('chart-dtype-count', () => ({
                    tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        itemStyle: { borderRadius: 6, borderColor: getBgColor(), borderWidth: 2 },
                        label: { formatter: '{b}\n{c}%', fontSize: 12, color: getTextColor() },
                        data: countData,
                    }]
                }));
            }

            if (op.dtype_analysis.by_time) {
                const timeData = op.dtype_analysis.by_time
                    .filter(d => d.pct > 0.5)
                    .map((d, i) => ({
                        name: d.dtype.replace('DT_', ''),
                        value: d.pct,
                        itemStyle: { color: dtypeColors[i % dtypeColors.length] },
                    }));
                initChart('chart-dtype-time', () => ({
                    tooltip: { trigger: 'item', formatter: '{b}: {c}% ({d}%)' },
                    series: [{
                        type: 'pie',
                        radius: ['40%', '70%'],
                        itemStyle: { borderRadius: 6, borderColor: getBgColor(), borderWidth: 2 },
                        label: { formatter: '{b}\n{c}%', fontSize: 12, color: getTextColor() },
                        data: timeData,
                    }]
                }));
            }
        }

        // ─── Type Breakdown Expanded Bar Chart ───
        if (op.type_breakdown && op.type_breakdown.length > 0) {
            const allTypes = op.type_breakdown.slice(0, 25);
            initChart('chart-type-breakdown', () => ({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: 180, right: 60, top: 20, bottom: 30 },
                xAxis: { type: 'value', name: '耗时占比 (%)', nameTextStyle: { fontSize: 11, color: getTextColor() }, ...axisStyle() },
                yAxis: {
                    type: 'category',
                    data: allTypes.map(t => t.type).reverse(),
                    axisLabel: { fontSize: 11, width: 160, overflow: 'truncate', color: getTextColor() },
                    ...axisStyle(),
                },
                series: [{
                    type: 'bar',
                    data: allTypes.map(t => t.pct).reverse(),
                    itemStyle: {
                        color: function(params) {
                            const gradColors = ['#4ecdc4', '#45b7aa', '#3da191', '#358b78', '#2d7560'];
                            return gradColors[Math.min(Math.floor(params.dataIndex / 5), gradColors.length - 1)];
                        },
                        borderRadius: [0, 4, 4, 0],
                    },
                    barMaxWidth: 18,
                    label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, color: getTextColor() },
                }]
            }));
        }

        // ─── Pipeline Utilization Grouped Bar Chart ───
        if (op.pipeline_utilization && op.pipeline_utilization.top_ops && op.pipeline_utilization.top_ops.length > 0) {
            const pipeOps = op.pipeline_utilization.top_ops;
            const pipeLabels = pipeOps.map(o => o.type.substring(0, 18));
            const pipeSeries = [
                { name: 'Mac', key: 'mac_ratio', color: '#4ecdc4' },
                { name: 'Vec', key: 'vec_ratio', color: '#f39c12' },
                { name: 'Scalar', key: 'scalar_ratio', color: '#9b59b6' },
                { name: 'MTE1', key: 'mte1_ratio', color: '#3498db' },
                { name: 'MTE2', key: 'mte2_ratio', color: '#e74c3c' },
                { name: 'MTE3', key: 'mte3_ratio', color: '#95a5a6' },
            ];

            initChart('chart-pipeline', () => ({
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        if (!params || !params.length) return '';
                        const idx = params[0].dataIndex;
                        const o = pipeOps[idx];
                        let html = '<b>' + o.type + '</b>';
                        if (o.dtype) html += '<br>Dtype: ' + o.dtype.replace('DT_', '');
                        if (o.shapes) html += '<br>Shape: ' + o.shapes;
                        params.forEach(p => {
                            if (p.value > 0) html += '<br>' + p.marker + ' ' + p.seriesName + ': ' + (p.value * 100).toFixed(1) + '%';
                        });
                        return html;
                    },
                },
                legend: { data: pipeSeries.map(s => s.name), top: 0, textStyle: { fontSize: 11, color: getTextColor() } },
                grid: { left: 20, right: 20, top: 40, bottom: 80 },
                xAxis: {
                    type: 'category',
                    data: pipeLabels,
                    axisLabel: { fontSize: 10, rotate: 30, color: getTextColor() },
                    ...axisStyle(),
                },
                yAxis: {
                    type: 'value', name: '利用率', max: 1.0,
                    axisLabel: { formatter: v => (v * 100).toFixed(0) + '%', color: getTextColor() },
                    ...axisStyle(),
                },
                series: pipeSeries.map(s => ({
                    name: s.name,
                    type: 'bar',
                    data: pipeOps.map(o => o[s.key]),
                    itemStyle: { color: s.color },
                    barMaxWidth: 12,
                })),
            }));

            // Render pipeline table with dtype & shapes
            renderPipelineTable(pipeOps);
        }

        // ─── Dispatch Rate Charts ───
        if (op.dispatch_rate && op.dispatch_rate.windows && op.dispatch_rate.windows.length > 1) {
            const dr = op.dispatch_rate;
            const windowLabels = dr.windows.map((_, i) => 'W' + i);
            const rates = dr.windows.map(w => w.rate);
            const bottleneckSet = new Set(dr.bottleneck_windows || []);

            initChart('chart-dispatch-rate', () => ({
                tooltip: { trigger: 'axis' },
                grid: { left: 60, right: 20, top: 30, bottom: 40 },
                xAxis: {
                    type: 'category',
                    data: windowLabels,
                    axisLabel: { fontSize: 10, color: getTextColor() },
                    ...axisStyle(),
                },
                yAxis: { type: 'value', name: 'ops/s', ...axisStyle() },
                series: [{
                    type: 'line',
                    data: rates,
                    smooth: true,
                    lineStyle: { color: '#4ecdc4', width: 2 },
                    areaStyle: { color: isDark() ? 'rgba(78,205,196,0.1)' : 'rgba(78,205,196,0.15)' },
                    itemStyle: {
                        color: function(params) {
                            return bottleneckSet.has(params.dataIndex) ? '#e74c3c' : '#4ecdc4';
                        },
                    },
                    symbolSize: function(val, params) {
                        return bottleneckSet.has(params.dataIndex) ? 8 : 4;
                    },
                    markLine: {
                        data: [{ type: 'average', name: '平均' }],
                        lineStyle: { color: '#f39c12', type: 'dashed' },
                        label: { formatter: '{c} ops/s', fontSize: 10, color: getTextColor() },
                    },
                }],
            }));

            // Wait time distribution
            if (dr.wait_time_dist) {
                const distLabels = Object.keys(dr.wait_time_dist);
                const distValues = Object.values(dr.wait_time_dist);
                initChart('chart-wait-dist', () => ({
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    grid: { left: 60, right: 20, top: 20, bottom: 40 },
                    xAxis: {
                        type: 'category',
                        data: distLabels,
                        axisLabel: { fontSize: 11, color: getTextColor() },
                        ...axisStyle(),
                    },
                    yAxis: { type: 'value', name: '算子数', ...axisStyle() },
                    series: [{
                        type: 'bar',
                        data: distValues,
                        itemStyle: {
                            color: function(params) {
                                const colors = ['#2ecc71', '#f39c12', '#e67e22', '#e74c3c'];
                                return colors[params.dataIndex] || '#95a5a6';
                            },
                            borderRadius: [4, 4, 0, 0],
                        },
                        barMaxWidth: 50,
                        label: { show: true, position: 'top', fontSize: 11, color: getTextColor() },
                    }],
                }));
            }
        }
    }

    // ─── Communication Bar Chart ───
    if (report.communication && report.communication.length > 0) {
        const cm = report.communication[0];
        if (cm.by_type) {
            const types = cm.by_type.slice(0, 10);
            initChart('chart-comm', () => ({
                tooltip: { trigger: 'axis' },
                legend: { data: ['耗时 (ms)', '带宽 (GB/s)'], top: 0, textStyle: { color: getTextColor() } },
                grid: { left: 150, right: 60, top: 40, bottom: 30 },
                xAxis: [
                    { type: 'value', name: '耗时 (ms)', position: 'bottom', nameTextStyle: { fontSize: 11, color: getTextColor() }, ...axisStyle() },
                ],
                yAxis: {
                    type: 'category',
                    data: types.map(t => t.type).reverse(),
                    axisLabel: { fontSize: 11, width: 130, overflow: 'truncate', color: getTextColor() },
                    ...axisStyle(),
                },
                series: [
                    {
                        name: '耗时 (ms)',
                        type: 'bar',
                        data: types.map(t => (t.time_us / 1000).toFixed(2)).reverse(),
                        itemStyle: { color: '#f39c12', borderRadius: [0, 4, 4, 0] },
                        barMaxWidth: 16,
                    },
                ]
            }));
        }
    }

    // ─── Overlap Analysis Chart ───
    if (report.step_trace && report.step_trace.length > 0) {
        const st = report.step_trace[0];
        if (st.overlap_analysis && st.overlap_analysis.per_step && st.overlap_analysis.per_step.length > 1) {
            const oa = st.overlap_analysis;
            const stepLabels = oa.per_step.map(s => 'Step ' + s.step);
            const stepRatios = oa.per_step.map(s => s.ratio);

            initChart('chart-overlap', () => ({
                tooltip: { trigger: 'axis', formatter: '{b}: {c}%' },
                grid: { left: 60, right: 20, top: 30, bottom: 40 },
                xAxis: {
                    type: 'category',
                    data: stepLabels,
                    axisLabel: { fontSize: 11, color: getTextColor() },
                    ...axisStyle(),
                },
                yAxis: {
                    type: 'value',
                    name: '重叠率 (%)',
                    max: 100,
                    ...axisStyle(),
                },
                series: [{
                    type: 'bar',
                    data: stepRatios,
                    itemStyle: {
                        color: function(params) {
                            const v = params.value;
                            if (v >= 80) return '#22C55E';
                            if (v >= 50) return '#F59E0B';
                            return '#EF4444';
                        },
                        borderRadius: [4, 4, 0, 0],
                    },
                    barMaxWidth: 40,
                    markLine: {
                        data: [{ yAxis: oa.target, name: '目标' }],
                        lineStyle: { color: '#e74c3c', type: 'dashed', width: 2 },
                        label: { formatter: '目标 {c}%', fontSize: 11, color: getTextColor() },
                    },
                }],
            }));
        }
    }

    // ─── Multi-Rank Grouped Bar Chart ───
    if (report.multi_rank && report.multi_rank.rank_count > 1) {
        const mr = report.multi_rank;
        const rankLabels = mr.ranks.map(r => 'Device ' + r.device_id);
        // Highlight: bottleneck ranks (computing bottleneck) in red, slow/waiting ranks in orange
        const bottleneckSet = new Set((mr.bottleneck_ranks || []).map(String));
        const slowSet = new Set((mr.slow_ranks || []).map(String));
        const highlightSet = new Set([...bottleneckSet, ...slowSet]);

        const phaseSeries = [
            { name: 'Computing', key: 'computing_us', color: '#4ecdc4' },
            { name: '通信(未掩盖)', key: 'comm_us', color: '#f39c12' },
            { name: 'Free', key: 'free_us', color: '#e74c3c' },
            { name: '通信(已掩盖)', key: 'overlapped_us', color: '#9b59b6' },
        ];

        initChart('chart-multi-rank', () => ({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    let s = '<b>' + params[0].name + '</b>';
                    const devId = mr.ranks[params[0].dataIndex] ? String(mr.ranks[params[0].dataIndex].device_id) : '';
                    if (bottleneckSet.has(devId)) s += ' <span style="color:#EF4444">计算瓶颈</span>';
                    else if (slowSet.has(devId)) s += ' <span style="color:#F97316">等待卡</span>';
                    s += '<br>';
                    let total = 0;
                    params.forEach(p => {
                        s += p.marker + ' ' + p.seriesName + ': ' + (p.value / 1000).toFixed(1) + ' ms<br>';
                        total += p.value;
                    });
                    s += '<br><b>合计: ' + (total / 1000).toFixed(1) + ' ms</b>';
                    if (mr.mean_total_us > 0) {
                        const dev = ((total - mr.mean_total_us) / mr.mean_total_us * 100).toFixed(1);
                        s += ' (偏差: ' + (dev > 0 ? '+' : '') + dev + '%)';
                    }
                    // Show Comm占比
                    const rank = mr.ranks[params[0].dataIndex];
                    if (rank) s += '<br>Comm 占比: ' + (rank.comm_pct || 0).toFixed(1) + '%';
                    return s;
                },
            },
            legend: { data: phaseSeries.map(s => s.name), top: 0, textStyle: { fontSize: 11, color: getTextColor() } },
            grid: { left: 80, right: 20, top: 40, bottom: 40 },
            xAxis: {
                type: 'category',
                data: rankLabels,
                axisLabel: {
                    fontSize: 11,
                    color: function(value, index) {
                        const devId = mr.ranks[index] ? String(mr.ranks[index].device_id) : '';
                        if (bottleneckSet.has(devId)) return '#EF4444';
                        if (slowSet.has(devId)) return '#F97316';
                        return getTextColor();
                    },
                    fontWeight: function(value, index) {
                        const devId = mr.ranks[index] ? String(mr.ranks[index].device_id) : '';
                        return highlightSet.has(devId) ? 'bold' : 'normal';
                    },
                },
                ...axisStyle(),
            },
            yAxis: {
                type: 'value',
                name: '时间 (us)',
                axisLabel: { fontSize: 11, formatter: v => (v / 1000).toFixed(0) + 'ms', color: getTextColor() },
                ...axisStyle(),
            },
            series: phaseSeries.map(s => ({
                name: s.name,
                type: 'bar',
                stack: 'total',
                data: mr.ranks.map(r => r[s.key]),
                itemStyle: { color: s.color },
                barMaxWidth: 40,
            })),
        }));
    }
})();
