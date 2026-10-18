import { displayAnswer, orderedQuestions, type SurveyDocument } from './questions';
import { summarizeQuestion, type ResponseGroup } from './report';

export function summarySheet(survey: string, doc: SurveyDocument, groups: ResponseGroup[]): string[][] {
  const rows = [
    ['Survey', 'Question', 'Metric', 'Responses', 'Answered', 'N/A', 'Skipped', 'Mean', 'Median', 'Min', 'Max', 'Favorable %', 'Agree %', 'Neutral %', 'Disagree %', 'Distribution', 'Comments'],
  ];
  for (const question of orderedQuestions(doc)) {
    if (question.type === 'info') continue;
    const report = summarizeQuestion(question, groups);
    rows.push([
      survey,
      report.title,
      report.metric,
      String(report.responses),
      String(report.answered),
      String(report.na),
      String(report.skipped),
      num(report.mean),
      num(report.median),
      num(report.min),
      num(report.max),
      num(report.favorablePercent),
      num(report.likert?.agreePercent ?? null),
      num(report.likert?.neutralPercent ?? null),
      num(report.likert?.disagreePercent ?? null),
      report.distribution.map((item) => `${item.label}: ${item.count} (${item.percent}%)`).join('; '),
      report.comments.join(' | '),
    ]);
  }
  return rows;
}

export function responseSheet(survey: string, doc: SurveyDocument, groups: ResponseGroup[]): string[][] {
  const rows = [['Survey', 'Response', 'Submitted', 'Question', 'Answer']];
  groups
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((group, index) => {
      for (const question of orderedQuestions(doc)) {
        if (question.type === 'info') continue;
        const answer = displayAnswer(question, group.answers[question.id]);
        if (!answer) continue;
        rows.push([survey, `Response ${index + 1}`, group.submittedOn, question.title, answer]);
      }
    });
  return rows;
}

function num(value: number | null): string {
  return value === null ? '' : String(value);
}
