import { BarChart, LineChart } from "echarts/charts";
import { AxisPointerComponent, DataZoomComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/hooks/useTheme";
import { type ChartType, formatInZone } from "@/lib/analytics";
import { type ChartLine, chartLines, chartTheme, MARK, PALETTE } from "@/lib/chartStyle";
import { axisIndexOf, type ChartGroup, unitAxes } from "@/lib/explore";
import { formatDuration } from "@/lib/format";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, AxisPointerComponent, MarkLineComponent, CanvasRenderer]);

/**
 * The chart of the Data explorer, Protect's Explore chart (its decisions D152 and D154) in
 * small: one graph, one thin line per metric and tracker over a shared time axis, the axes
 * decided by unit (the first unit left, the others right), markers only under the pointer,
 * one crosshair and one value card, and legend chips above that toggle lines. Hovering reports
 * the moment under the pointer; a moment marked elsewhere (the table, the map) shows here as a
 * thin line, and the pinned moment as a dashed one.
 */
export function ExploreChart({
  groups,
  kind,
  timezone,
  phone = false,
  marked,
  pinned,
  onHover,
  onPick,
  colours,
}: {
  groups: ChartGroup[];
  kind: ChartType;
  timezone: string;
  phone?: boolean;
  marked: number | null;
  pinned: number | null;
  onHover: (ms: number | null) => void;
  onPick: (ms: number) => void;
  /** The tracker colours shared with the map and the table. */
  colours: Map<string, string>;
}) {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const hovering = useRef(false);
  const handlers = useRef({ onHover, onPick });
  useEffect(() => {
    handlers.current = { onHover, onPick };
  }, [onHover, onPick]);
  const [hidden, setHidden] = useState<string[]>([]);
  const lines = useMemo(() => {
    const drawn = chartLines(groups);
    // one metric: the tracker's colour, as on the map; several: Protect's palette per line
    return groups.length === 1 ? drawn.map((l) => ({ ...l, colour: colours.get(l.key.split("|")[1]) ?? l.colour })) : drawn;
  }, [groups, colours]);
  const shown = useMemo(() => lines.filter((l) => !hidden.includes(l.key)), [lines, hidden]);

  useEffect(() => {
    if (!container.current) return;
    const instance = echarts.init(container.current, undefined, { renderer: "canvas" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    const zr = instance.getZr();
    const momentAt = (event: { offsetX: number; offsetY: number }) => {
      const point = instance.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY]) as unknown;
      const ms = Array.isArray(point) ? point[0] : null;
      return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
    };
    zr.on("mousemove", (event: { offsetX: number; offsetY: number }) => {
      hovering.current = true;
      const ms = momentAt(event);
      if (ms !== null) handlers.current.onHover(ms);
    });
    zr.on("click", (event: { offsetX: number; offsetY: number }) => {
      const ms = momentAt(event);
      if (ms !== null) handlers.current.onPick(ms);
    });
    zr.on("globalout", () => {
      hovering.current = false;
      handlers.current.onHover(null);
    });
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(buildOption(shown, groups, kind, timezone, phone, dark), true);
  }, [shown, groups, kind, timezone, phone, dark]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || shown.length === 0) return;
    const data: unknown[] = [];
    if (pinned !== null) data.push({ xAxis: pinned, lineStyle: { color: MARK, width: 1, type: "dashed", opacity: 0.8 } });
    if (marked !== null && marked !== pinned && !hovering.current) data.push({ xAxis: marked, lineStyle: { color: chartTheme(dark).text, width: 1, type: "solid", opacity: 0.7 } });
    instance.setOption({ series: [{ markLine: { silent: true, symbol: "none", label: { show: false }, animation: false, data } }] });
  }, [marked, pinned, shown, dark]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {lines.length > 0 && (
        <div className={`flex shrink-0 gap-1.5 px-3 pt-2 pb-1 ${phone ? "overflow-x-auto [scrollbar-width:none]" : "flex-wrap"}`}>
          {lines.map((line) => {
            const off = hidden.includes(line.key);
            return (
              <button
                key={line.key}
                type="button"
                aria-pressed={!off}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${off ? "text-muted-foreground opacity-60" : "bg-card"}`}
                onClick={() => setHidden((h) => (off ? h.filter((k) => k !== line.key) : [...h, line.key]))}
              >
                <span className="inline-block size-2 rounded-full" style={{ background: off ? "transparent" : line.colour, boxShadow: `inset 0 0 0 1.5px ${line.colour}` }} />
                {line.name}
                {line.group.unit && <span className="text-muted-foreground">{line.group.unit}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div ref={container} className="min-h-0 flex-1" role="img" aria-label={t("Chart of the selection")} />
    </div>
  );
}

function valueText(value: unknown, unit: string | null): string {
  if (typeof value === "number" && unit === "s") return formatDuration(value);
  if (typeof value !== "number") return String(value ?? "");
  const text = Number.isInteger(value) ? String(value) : Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return `${text}${unit ? ` ${unit}` : ""}`;
}

function timeFormatter(span: number, timezone: string) {
  const day = 24 * 3600_000;
  return (value: number) => {
    const iso = new Date(value).toISOString();
    if (span >= 3 * day) return formatInZone(iso, timezone, { dateStyle: undefined, timeStyle: undefined, day: "numeric", month: "short" });
    if (span >= day) return formatInZone(iso, timezone, { dateStyle: undefined, timeStyle: undefined, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return formatInZone(iso, timezone, { dateStyle: undefined, timeStyle: undefined, hour: "2-digit", minute: "2-digit" });
  };
}

function card(text: string, title: string, rows: { colour: string; name: string; value: string }[]): string {
  const lines = rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="width:8px;height:8px;border-radius:9999px;background:${r.colour};flex:none"></span><span style="color:${text};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${r.name}</span><b style="font-variant-numeric:tabular-nums">${r.value}</b></div>`,
    )
    .join("");
  return `<div style="font-size:12px;min-width:160px"><div style="color:${text};margin-bottom:4px">${title}</div>${lines}</div>`;
}

function buildOption(lines: ChartLine[], groups: ChartGroup[], kind: ChartType, timezone: string, phone: boolean, dark: boolean): echarts.EChartsCoreOption {
  const th = chartTheme(dark);
  const AXIS_TEXT = { color: th.text, fontSize: 11 };
  const base: echarts.EChartsCoreOption = {
    animation: false,
    textStyle: { fontFamily: "inherit", color: th.text },
    tooltip: { backgroundColor: th.tooltipBg, borderColor: th.grid, borderWidth: 1, padding: [8, 10], textStyle: { color: th.tooltipText, fontSize: 12 }, extraCssText: `box-shadow: ${th.shadow}; border-radius: 8px;`, confine: true },
  };
  if (lines.length === 0) return base;
  const times = lines.flatMap((l) => l.data.map((d) => d[0]));
  const span = Math.max(...times) - Math.min(...times);
  const timeLabel = timeFormatter(span, timezone);
  const timeTitle = (value: number) => formatInZone(new Date(value).toISOString(), timezone, { dateStyle: "medium", timeStyle: "short" });
  const grid = { left: 48, right: 16, top: 24, bottom: phone ? 28 : 56, containLabel: false };
  // a value axis that hugs the data (Protect, Tim 2026-09-09: a battery between 4.09 and 4.12 V
  // fills the graph), a little air, rounded to a clean step
  const bounds = (extent: { min: number; max: number }): [number, number] => {
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
  };
  const valueAxis = {
    type: "value",
    scale: true,
    min: (extent: { min: number; max: number }) => bounds(extent)[0],
    max: (extent: { min: number; max: number }) => bounds(extent)[1],
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: AXIS_TEXT,
    splitLine: { lineStyle: { color: th.grid } },
    nameTextStyle: { ...AXIS_TEXT, align: "left" },
    nameGap: 8,
  };
  const units = unitAxes(groups);
  const yAxis: unknown[] = [{ ...valueAxis, name: units[0] ?? "" }];
  if (units.length > 1) yAxis.push({ ...valueAxis, name: units.slice(1).join(" / "), nameTextStyle: { ...AXIS_TEXT, align: "right" }, position: "right", splitLine: { show: false } });
  const series = lines.map((l) => {
    const common = {
      name: l.name,
      yAxisIndex: yAxis.length > 1 ? axisIndexOf(l.group, units) : 0,
      data: l.data,
      itemStyle: { color: l.colour },
      lineStyle: { color: l.colour, width: 1.5 },
      emphasis: { focus: "none", lineStyle: { width: 2 } },
    };
    if (kind === "state") return { ...common, type: "line", step: "end", showSymbol: false, areaStyle: { opacity: 0.05 } };
    if (kind === "bar") return { ...common, type: "bar", barMaxWidth: 10 };
    return { ...common, type: "line", showSymbol: l.data.length <= 1000, symbol: "circle", symbolSize: 4, emphasis: { focus: "none", scale: 1.6, lineStyle: { width: 2 } }, connectNulls: false };
  });
  return {
    ...base,
    tooltip: {
      ...(base.tooltip as object),
      trigger: "axis",
      axisPointer: { type: "line", snap: true, lineStyle: { color: th.text, width: 1 } },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; seriesIndex: number; color: string; value: number[] }[];
        if (!items.length) return "";
        return card(
          th.text,
          timeTitle(items[0].value[0]),
          items.map((p) => ({ colour: p.color, name: p.seriesName, value: valueText(p.value[1], lines[p.seriesIndex]?.group.unit ?? null) })),
        );
      },
    },
    grid,
    xAxis: { type: "time", axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: { ...AXIS_TEXT, formatter: timeLabel, hideOverlap: true }, splitLine: { show: false }, axisPointer: { label: { show: false } } },
    yAxis,
    dataZoom: phone
      ? [{ type: "inside" }]
      : [
          { type: "inside" },
          {
            type: "slider",
            height: 18,
            bottom: 8,
            borderColor: th.grid,
            fillerColor: "rgba(82,115,94,0.12)",
            dataBackground: { lineStyle: { color: th.grid }, areaStyle: { color: "#F3F4F6" } },
            selectedDataBackground: { lineStyle: { color: PALETTE[0] }, areaStyle: { color: "rgba(82,115,94,0.15)" } },
            handleStyle: { borderColor: th.grid },
            textStyle: AXIS_TEXT,
          },
        ],
    series,
  };
}
