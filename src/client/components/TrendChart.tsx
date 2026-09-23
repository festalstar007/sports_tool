import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
import type { TrendPoint } from '../../shared/activity-schema';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export function TrendChart({ points, formatValue }: { points: TrendPoint[]; formatValue: (value: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      grid: { left: 18, right: 18, top: 22, bottom: 30, containLabel: true },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => formatValue(Number(value)),
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) => point.bucket),
        axisLabel: { color: '#6b756f', hideOverlap: true },
        axisLine: { lineStyle: { color: '#d9dfda' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#6b756f', formatter: (value: number) => formatValue(value) },
        splitLine: { lineStyle: { color: '#eef1ee' } },
      },
      series: [{
        type: 'line',
        data: points.map((point) => point.value),
        smooth: 0.25,
        symbolSize: 7,
        lineStyle: { color: '#19856c', width: 3 },
        itemStyle: { color: '#ff7a45', borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: 'rgba(25, 133, 108, 0.10)' },
      }],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [points, formatValue]);

  return <div className="trend-chart" ref={ref} role="img" aria-label="运动趋势曲线" />;
}
