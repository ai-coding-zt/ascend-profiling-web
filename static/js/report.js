/* ─── ECharts Report Rendering ─── */

(function() {
    const report = window.__REPORT__;
    if (!report) return;

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

    // ─── Pie Chart: Cube/Vector Distribution ───
    if (report.op_analysis && report.op_analysis.length > 0) {
        const op = report.op_analysis[0];
        const cv = op.cube_vector;

        const pieEl = document.getElementById('chart-pie');
        if (pieEl) {
            const pie = echarts.init(pieEl);
            const pieData = Object.entries(cv)
                .filter(([_, v]) => v.pct > 0)
                .map(([k, v]) => ({
                    name: LABELS[k] || k,
                    value: v.pct,
                    itemStyle: { color: COLORS[k] || '#ccc' },
                }));

            pie.setOption({
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c}% ({d}%)'
                },
                series: [{
                    type: 'pie',
                    radius: ['40%', '70%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    label: { formatter: '{b}\n{c}%', fontSize: 12 },
                    data: pieData,
                }]
            });
            window.addEventListener('resize', () => pie.resize());
        }

        // ─── Bar Chart: Type Breakdown ───
        const barEl = document.getElementById('chart-type-bar');
        if (barEl && op.type_breakdown) {
            const bar = echarts.init(barEl);
            const types = op.type_breakdown.slice(0, 12);

            bar.setOption({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                grid: { left: 160, right: 40, top: 20, bottom: 30 },
                xAxis: { type: 'value', name: '耗时占比 (%)', nameTextStyle: { fontSize: 11 } },
                yAxis: {
                    type: 'category',
                    data: types.map(t => t.type).reverse(),
                    axisLabel: { fontSize: 11, width: 140, overflow: 'truncate' },
                },
                series: [{
                    type: 'bar',
                    data: types.map(t => t.pct).reverse(),
                    itemStyle: { color: '#4ecdc4', borderRadius: [0, 4, 4, 0] },
                    barMaxWidth: 20,
                    label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11 },
                }]
            });
            window.addEventListener('resize', () => bar.resize());
        }
    }

    // ─── Communication Bar Chart ───
    if (report.communication && report.communication.length > 0) {
        const cm = report.communication[0];
        const commEl = document.getElementById('chart-comm');
        if (commEl && cm.by_type) {
            const chart = echarts.init(commEl);
            const types = cm.by_type.slice(0, 10);

            chart.setOption({
                tooltip: { trigger: 'axis' },
                legend: { data: ['耗时 (ms)', '带宽 (GB/s)'], top: 0 },
                grid: { left: 150, right: 60, top: 40, bottom: 30 },
                xAxis: [
                    { type: 'value', name: '耗时 (ms)', position: 'bottom', nameTextStyle: { fontSize: 11 } },
                ],
                yAxis: {
                    type: 'category',
                    data: types.map(t => t.type).reverse(),
                    axisLabel: { fontSize: 11, width: 130, overflow: 'truncate' },
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
            });
            window.addEventListener('resize', () => chart.resize());
        }
    }
})();
