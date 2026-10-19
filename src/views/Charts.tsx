import type { FC } from 'hono/jsx';
import type { Bar, ComparisonBar, DrawnChart, Slice, Trend } from '../lib/charts';

export const ChartFigure: FC<{ chart: DrawnChart }> = ({ chart }) => (
  <figure class="mt-4">
    {chart.title ? <figcaption class="mb-2 font-semibold text-navy">{chart.title}</figcaption> : null}
    {chart.kind === 'diverging' || chart.kind === 'stacked' ? <SliceBar slices={chart.slices} label={chart.kind === 'stacked' ? 'Yes and no' : 'Rating distribution'} /> : null}
    {chart.kind === 'diverging' ? <Legend slices={chart.legend} /> : null}
    {chart.kind === 'stacked' ? <Legend slices={chart.slices} /> : null}
    {chart.kind === 'bars' ? <HorizontalBars bars={chart.bars} /> : null}
    {chart.kind === 'histogram' ? <Histogram bars={chart.bars} /> : null}
  </figure>
);

export const TrendChart: FC<{ trend: Trend }> = ({ trend }) => {
  const width = 320;
  const height = 120;
  const pad = 18;
  const span = trend.max - trend.min || 1;
  const coords = trend.points.map((point, index) => {
    const x = pad + (index / (trend.points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((point.mean - trend.min) / span) * (height - pad * 2);
    return { ...point, x, y };
  });
  return (
    <figure class="mt-4">
      <figcaption class="mb-2 text-sm text-muted">Daily mean</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} class="chart-line" role="img" aria-label="Daily mean">
        <polyline fill="none" stroke="#00205b" stroke-width="2" points={coords.map((point) => `${point.x},${point.y}`).join(' ')} />
        {coords.map((point) => (
          <circle cx={point.x} cy={point.y} r="3.5" fill="#00205b" />
        ))}
      </svg>
      <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {coords.map((point) => (
          <li>
            {point.label}: {point.mean}
          </li>
        ))}
      </ul>
    </figure>
  );
};

export const ComparisonChart: FC<{ bars: ComparisonBar[] }> = ({ bars }) => {
  const max = Math.max(...bars.map((bar) => bar.mean), 0);
  return (
    <figure class="mt-4">
      <figcaption class="mb-2 text-sm text-muted">Same metric in other sessions</figcaption>
      <div class="grid gap-2">
        {bars.map((bar) => (
          <div class="chart-bar-row">
            <span class="chart-bar-label truncate text-sm">{bar.current ? `${bar.label} (this survey)` : bar.label}</span>
            <div class="chart-bar-track" aria-hidden="true">
              <div class={bar.current ? 'chart-bar-fill is-current' : 'chart-bar-fill'} style={`width: ${max === 0 ? 0 : Math.round((bar.mean / max) * 100)}%`}></div>
            </div>
            <span class="text-sm text-muted">{bar.mean}</span>
          </div>
        ))}
      </div>
    </figure>
  );
};

const SliceBar: FC<{ slices: Slice[]; label: string }> = ({ slices, label }) => (
  <div class="chart-stack" role="img" aria-label={label}>
    {slices.map((slice) => (
      <div class="chart-slice" data-tone={slice.tone} style={`width: ${slice.percent}%`} title={`${slice.label}: ${slice.count}`}>
        {slice.percent >= 12 ? <span>{slice.count}</span> : null}
      </div>
    ))}
  </div>
);

const Legend: FC<{ slices: Slice[] }> = ({ slices }) => (
  <ul class="mt-2 grid gap-1">
    {slices.map((slice) => (
      <li class="flex items-center justify-between gap-3 text-sm">
        <span class="flex items-center gap-2">
          <i class="chart-swatch" data-tone={slice.tone}></i>
          {slice.label}
        </span>
        <span class="text-muted">
          {slice.count} ({slice.percent}%)
        </span>
      </li>
    ))}
  </ul>
);

const HorizontalBars: FC<{ bars: Bar[] }> = ({ bars }) => (
  <div class="grid gap-2">
    {bars.map((bar) => (
      <div class="chart-bar-row">
        <span class="chart-bar-label text-sm">{bar.label}</span>
        <div class="chart-bar-track" role="img" aria-label={`${bar.label}: ${bar.count}`}>
          <div class="chart-bar-fill" style={`width: ${bar.width}%`}></div>
        </div>
        <span class="text-sm text-muted">
          {bar.count} ({bar.percent}%)
        </span>
      </div>
    ))}
  </div>
);

const Histogram: FC<{ bars: Bar[] }> = ({ bars }) => (
  <div class="chart-hist" role="img" aria-label="Rating histogram">
    {bars.map((bar) => (
      <div class="chart-hist-col">
        <span class="text-xs text-muted">{bar.count}</span>
        <div class="chart-hist-fill" style={`height: ${bar.width}%`}></div>
        <span class="chart-hist-label text-xs">{bar.label}</span>
      </div>
    ))}
  </div>
);
