import { describe, expect, it } from 'vitest';
import { chartsForQuestion, divergingBar, percentShares, reportBlock } from '../src/lib/charts';
import { buildSurveyPdf } from '../src/lib/pdf';
import { newQuestion } from '../src/lib/questions';
import { summarizeQuestion, type ResponseGroup } from '../src/lib/report';

describe('survey charts', () => {
  it('splits a 1–5 rating into left, center, and right widths', () => {
    const question = newQuestion('rating', 'rate', 'Quality');
    const groups: ResponseGroup[] = [
      { id: 'a', submittedOn: '2026-10-19', answers: { rate: { t: 'num', v: 1 } } },
      { id: 'b', submittedOn: '2026-10-19', answers: { rate: { t: 'num', v: 3 } } },
      { id: 'c', submittedOn: '2026-10-20', answers: { rate: { t: 'num', v: 3 } } },
      { id: 'd', submittedOn: '2026-10-20', answers: { rate: { t: 'num', v: 5 } } },
    ];
    const report = summarizeQuestion(question, groups);
    const [chart] = chartsForQuestion(question, report);
    expect(chart?.kind).toBe('diverging');
    if (chart?.kind !== 'diverging') return;
    expect(chart.left).toBe(1);
    expect(chart.center).toBe(2);
    expect(chart.right).toBe(1);
    expect(chart.slices.map((slice) => slice.percent)).toEqual([25, 50, 25]);
    expect(chart.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
    const block = reportBlock(question, groups, null);
    expect(block.trend?.points.map((point) => point.mean)).toEqual([2, 4]);
  });

  it('makes a yes/no bar total 100 percent', () => {
    const question = newQuestion('yes_no', 'stay', 'Stay');
    const groups: ResponseGroup[] = [
      { id: 'a', submittedOn: '2026-10-19', answers: { stay: { t: 'choice', id: 'yes' } } },
      { id: 'b', submittedOn: '2026-10-19', answers: { stay: { t: 'choice', id: 'no' } } },
      { id: 'c', submittedOn: '2026-10-19', answers: { stay: { t: 'choice', id: 'no' } } },
      { id: 'd', submittedOn: '2026-10-19', answers: { stay: { t: 'choice', id: 'no' } } },
    ];
    const [chart] = chartsForQuestion(question, summarizeQuestion(question, groups));
    expect(chart?.kind).toBe('stacked');
    if (chart?.kind !== 'stacked') return;
    expect(chart.slices.map((slice) => slice.percent)).toEqual([25, 75]);
    expect(chart.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
  });

  it('keeps rounded shares at 100', () => {
    expect(percentShares([1, 7]).reduce((sum, value) => sum + value, 0)).toBe(100);
    const bar = divergingBar([
      { value: 1, label: '1', count: 1 },
      { value: 2, label: '2', count: 0 },
      { value: 3, label: '3', count: 2 },
      { value: 4, label: '4', count: 0 },
      { value: 5, label: '5', count: 1 },
    ]);
    expect(bar.left + bar.center + bar.right).toBe(4);
  });

  it('writes a PDF that starts with the PDF header', async () => {
    const question = newQuestion('rating', 'rate', 'Quality');
    const groups: ResponseGroup[] = [
      { id: 'a', submittedOn: '2026-10-19', answers: { rate: { t: 'num', v: 5 } } },
      { id: 'b', submittedOn: '2026-10-20', answers: { rate: { t: 'num', v: 2 } } },
    ];
    const bytes = await buildSurveyPdf({
      title: 'Session evaluation',
      context: 'Company · Leadership',
      responseCount: 2,
      expected: 10,
      warning: null,
      blocks: [reportBlock(question, groups, [{ label: 'Session evaluation', mean: 3.5, current: true }, { label: 'Other session', mean: 4, current: false }])],
      rows: [
        ['Survey', 'Response', 'Submitted', 'Question', 'Answer'],
        ['Session evaluation', 'Response 1', '2026-10-19', 'Quality', '5 Excellent'],
        ['Session evaluation', 'Response 2', '2026-10-20', 'Quality', '2 Fair'],
      ],
    });
    expect(Buffer.from(bytes.subarray(0, 5)).toString('utf8')).toBe('%PDF-');
  });
});
