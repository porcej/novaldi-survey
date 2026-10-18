import type { FC } from 'hono/jsx';
import {
  OTHER_ID,
  fieldName,
  otherField,
  type FieldError,
  type Question,
  type SurveyDocument,
} from '../lib/questions';

type Values = Record<string, string[]>;

export const SurveyForm: FC<{
  document: SurveyDocument;
  action?: string;
  values?: Values;
  errors?: FieldError[];
  anonymity: 'anonymous' | 'identified';
  preview?: boolean;
}> = (props) => {
  const sections = props.document.sections.filter((section) => section.questions.length > 0 || section.title);
  return (
    <form method="post" action={props.action} data-survey autocomplete="off" class="space-y-8">
      {props.anonymity === 'anonymous' ? (
        <p class="border border-navy/15 bg-surface px-4 py-3 text-sm leading-relaxed text-navy">
          This survey does not ask who you are. Your answers are stored without your name. Please submit once from this device. Clearing the browser or using another device can submit again.
        </p>
      ) : (
        <p class="border border-gold-dark/40 bg-gold/25 px-4 py-3 text-sm leading-relaxed text-navy">
          This survey is not anonymous. Your name and contact details are stored with your answers and are visible to LDI administrators.
        </p>
      )}
      {sections.map((section, index) => (
        <section id={`section-${index}`} data-section data-show={JSON.stringify(section.visibility)} class="scroll-mt-24">
          <h2 class="font-display text-3xl font-bold uppercase tracking-wide text-navy">{section.title}</h2>
          {section.description ? <p class="mt-2 whitespace-pre-wrap text-muted">{section.description}</p> : null}
          <div class="mt-6">
            {section.questions.map((question) => (
              <QuestionBlock question={question} values={props.values} error={props.errors?.find((item) => item.id === question.id)?.message} />
            ))}
          </div>
        </section>
      ))}
      {props.preview ? (
        <p class="text-sm text-muted">Preview only. Answers are not saved.</p>
      ) : (
        <div class="flex flex-wrap gap-3">
          <button type="button" data-back hidden class="btn btn-quiet">
            Back
          </button>
          <button type="button" data-next hidden class="btn btn-secondary">
            Continue
          </button>
          <button type="submit" data-submit class="btn btn-primary">
            Submit evaluation
          </button>
        </div>
      )}
    </form>
  );
};

const QuestionBlock: FC<{ question: Question; values?: Values; error?: string }> = (props) => {
  if (props.question.type === 'info') {
    return (
      <div class="question-block" data-show={JSON.stringify(props.question.visibility)}>
        <h3 class="font-display text-2xl font-bold uppercase text-navy">{props.question.title}</h3>
        {props.question.description ? <p class="mt-2 whitespace-pre-wrap text-muted">{props.question.description}</p> : null}
      </div>
    );
  }
  const describedBy = props.error ? `error-${props.question.id}` : undefined;
  return (
    <fieldset class="question-block" data-qid={props.question.id} data-show={JSON.stringify(props.question.visibility)} data-invalid={props.error ? '' : undefined} aria-describedby={describedBy}>
      <legend class="font-display text-2xl font-bold uppercase tracking-wide text-navy">
        {props.question.title}
        {props.question.required ? <span class="ml-2 font-body text-sm font-semibold normal-case tracking-normal text-muted">Required</span> : null}
      </legend>
      {props.question.description ? <p class="mt-2 whitespace-pre-wrap text-muted">{props.question.description}</p> : null}
      <div class="mt-4">
        <Control question={props.question} values={props.values} />
      </div>
      {props.error ? (
        <p id={describedBy} class="mt-2 text-sm text-red-800" role="alert">
          {props.error}
        </p>
      ) : null}
    </fieldset>
  );
};

const Control: FC<{ question: Question; values?: Values }> = ({ question, values }) => {
  if (question.type === 'rating' || question.type === 'likert') {
    const name = fieldName(question.id);
    const choices = [];
    for (let value = question.scale.min; value <= question.scale.max; value += 1) {
      const label = question.scale.labels[String(value)];
      choices.push({ value: String(value), label: label ? `${value} ${label}` : String(value) });
    }
    return (
      <div class="scale">
        {choices.map((choice) => (
          <ScaleOption name={name} value={choice.value} label={choice.label} checked={has(values, name, choice.value)} />
        ))}
        {question.scale.allowNa ? <ScaleOption name={name} value="na" label="N/A" checked={has(values, name, 'na')} /> : null}
      </div>
    );
  }
  if (question.type === 'yes_no') {
    const name = fieldName(question.id);
    return (
      <div class="scale">
        <ScaleOption name={name} value="yes" label={question.yesLabel} checked={has(values, name, 'yes')} />
        <ScaleOption name={name} value="no" label={question.noLabel} checked={has(values, name, 'no')} />
      </div>
    );
  }
  if (question.type === 'single') return <ChoiceList question={question} values={values} multiple={false} />;
  if (question.type === 'multi') return <ChoiceList question={question} values={values} multiple />;
  if (question.type === 'dropdown') {
    const name = fieldName(question.id);
    const current = values?.[name]?.[0] ?? '';
    return (
      <div class="space-y-3">
        <select class="select" name={name}>
          <option value="">Select</option>
          {question.choices.map((choice) => (
            <option value={choice.id} selected={current === choice.id}>
              {choice.label}
            </option>
          ))}
          {question.allowOther ? (
            <option value={OTHER_ID} selected={current === OTHER_ID}>
              Other
            </option>
          ) : null}
        </select>
        {question.allowOther ? <OtherInput questionId={question.id} values={values} /> : null}
      </div>
    );
  }
  if (question.type === 'short_text' || question.type === 'email' || question.type === 'phone') {
    const name = fieldName(question.id);
    return (
      <input
        class="input"
        name={name}
        value={values?.[name]?.[0] ?? ''}
        maxlength={question.type === 'short_text' ? question.maxLength : 200}
        placeholder={question.placeholder || undefined}
        autocomplete={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'off'}
        inputmode={question.type === 'phone' ? 'tel' : question.type === 'email' ? 'email' : undefined}
      />
    );
  }
  if (question.type === 'long_text') {
    const name = fieldName(question.id);
    return <textarea class="textarea" name={name} maxlength={question.maxLength} placeholder={question.placeholder || undefined}>{values?.[name]?.[0] ?? ''}</textarea>;
  }
  if (question.type === 'matrix') {
    return (
      <div class="grid gap-3">
        {question.rows.map((row) => {
          const name = fieldName(question.id, row.id);
          return (
            <fieldset class="matrix-card">
              <legend class="font-semibold text-navy">{row.label}</legend>
              <div class="scale mt-3">
                {question.columns.map((column) => (
                  <ScaleOption name={name} value={column.id} label={column.label} checked={has(values, name, column.id)} />
                ))}
                {question.allowNa ? <ScaleOption name={name} value="na" label="N/A" checked={has(values, name, 'na')} /> : null}
              </div>
            </fieldset>
          );
        })}
      </div>
    );
  }
  return null;
};

const ChoiceList: FC<{ question: { id: string; choices: { id: string; label: string }[]; allowOther: boolean }; values?: Values; multiple: boolean }> = (props) => {
  const name = fieldName(props.question.id);
  return (
    <div class="grid gap-2">
      {props.question.choices.map((choice) => (
        <label class="flex min-h-11 items-center gap-3 border border-navy/10 px-3 py-2">
          <input type={props.multiple ? 'checkbox' : 'radio'} name={name} value={choice.id} data-label={choice.label} checked={has(props.values, name, choice.id)} />
          <span>{choice.label}</span>
        </label>
      ))}
      {props.question.allowOther ? (
        <div class="space-y-2">
          <label class="flex min-h-11 items-center gap-3 border border-navy/10 px-3 py-2">
            <input type={props.multiple ? 'checkbox' : 'radio'} name={name} value={OTHER_ID} data-label="Other" checked={has(props.values, name, OTHER_ID)} />
            <span>Other</span>
          </label>
          <OtherInput questionId={props.question.id} values={props.values} />
        </div>
      ) : null}
    </div>
  );
};

const ScaleOption: FC<{ name: string; value: string; label: string; checked: boolean }> = (props) => (
  <label class="scale-option">
    <input type="radio" name={props.name} value={props.value} data-label={props.label} checked={props.checked} />
    <span>{props.label}</span>
  </label>
);

const OtherInput: FC<{ questionId: string; values?: Values }> = (props) => {
  const name = otherField(props.questionId);
  return <input class="input" name={name} value={props.values?.[name]?.[0] ?? ''} placeholder="Please describe" maxlength={500} autocomplete="off" />;
};

function has(values: Values | undefined, name: string, value: string): boolean {
  return values?.[name]?.includes(value) ?? false;
}
