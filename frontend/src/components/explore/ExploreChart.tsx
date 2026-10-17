import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer]);

export interface ChartSeries {
  key: string;
  name: string;
  colour: string;
  /** `[time in ms, value]`, in time order. */
  data: number[][];
}

/** The text, grid and tooltip colours of a chart on the light or the dark theme (Protect's
 * `chartTheme`, decision D183 there). */
function chartTheme(dark: boolean) {
  return dark
    ? { text: "#9fb0a6", grid: "#2d3d35", tooltipBg: "rgba(26,35,32,0.96)", tooltipText: "#e6ece8", shadow: "0 4px 12px rgba(0,0,0,0.4)" }
    : { text: "#6B7280", grid: "#E5E7EB", tooltipBg: "rgba(255,255,255,0.96)", tooltipText: "#111827", shadow: "0 4px 12px rgba(0,0,0,0.08)" };
}

/** A value axis that hugs the data, as Protect's Explore chart draws it: a little air, rounded
 * to a clean step; a constant series gets a sliver of range so it still draws as a line. */
function bounds(extent: { min: number; max: number }): [number, number] {
  const spread = extent.max - extent.min;
  const pad = spread > 0 ? spread * 0.08 : Math.abs(extent.max || extent.min || 1) * 0.005;
  const nice = (v: number) => {
    const e = 10 ** Math.floor(Math.log10(v));
    const f = v / e;
    return e * (f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10);
  };
  const tidy = (v: number) => Number(v.toFixed(10));
  let low = extent.min - pad;
  let high = extent.max + pad;
  for (let i = 0; i < 4; i++) {
    const step = nice((high - low) / 5);
    const nextLow = tidy(Math.floor(low / step) * step);
    const nextHigh = tidy(Math.ceil(high / step) * step);
    if (nextLow === low && nextHigh === high) break;
    low = nextLow;
    high = nextHigh;
  }
  return [low, high];
}

function buildOption(series: ChartSeries[], dark: boolean, unit: string | null): echarts.EChartsCoreOption {
  const th = chartTheme(dark);
  const axisText = { color: th.text, fontSize: 11 };
  return {
    animation: false,
    textStyle: { fontFamily: "inherit", color: th.text },
    tooltip: {
      trigger: "axis",
      backgroundColor: th.tooltipBg,
      borderColor: th.grid,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: th.tooltipText, fontSize: 12 },
      extraCssText: `box-shadow: ${th.shadow}; border-radius: 8px;`,
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: th.text, width: 1, opacity: 0.6 } },
      valueFormatter: (value: unknown) => (typeof value === "number" ? `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}` : String(value ?? "")),
    },
    legend: { show: series.length > 1, top: 0, textStyle: axisText, icon: "circle", itemWidth: 8, itemHeight: 8 },
    grid: { left: 56, right: 16, top: series.length > 1 ? 32 : 16, bottom: 52, containLabel: false },
    xAxis: { type: "time", axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: axisText, splitLine: { show: false } },
    yAxis: {
      type: "value",
      scale: true,
      min: (extent: { min: number; max: number }) => bounds(extent)[0],
      max: (extent: { min: number; max: number }) => bounds(extent)[1],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisText,
      splitLine: { lineStyle: { color: th.grid } },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "slider", xAxisIndex: 0, height: 18, bottom: 8, borderColor: th.grid, textStyle: axisText, brushSelect: false },
    ],
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data,
      showSymbol: false,
      symbolSize: 5,
      lineStyle: { width: 1.5, color: s.colour },
      itemStyle: { color: s.colour },
      emphasis: { focus: "series" },
      connectNulls: false,
    })),
  };
}

/** One graph of the Data explorer (decision D21), as Protect's Explore chart in small: one
 * thin line per tracker over a shared time axis, the value axis hugging the data, a crosshair
 * with one value card, a legend when there is more than one line, and a zoom strip. */
export function ExploreChart({ series, dark, unit = null, className = "h-64 w-full" }: { series: ChartSeries[]; dark: boolean; unit?: string | null; className?: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    chart.current?.setOption(buildOption(series, dark, unit), true);
  }, [series, dark, unit]);
  return <div ref={container} className={className} role="img" aria-label={series.map((s) => s.name).join(", ")} />;
}
