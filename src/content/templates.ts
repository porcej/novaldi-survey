import {
  LIKERT_LABELS,
  RATING_LABELS,
  scaleColumns,
  standardScale,
  type Question,
  type SurveyDocument,
  type SurveySection,
} from '../lib/questions';

export const EVENT_NAME = '2026 NVFR LDI';
export const EVENT_TIMEZONE = 'America/New_York';
export const EVENT_START = '2026-10-19';
export const EVENT_END = '2026-10-24';

export const CATEGORIES = [
  'Instructional Sessions',
  'Practical Exercises',
  'Instructor Evaluations',
  'Food & Hospitality',
  'Facilities & Accommodations',
  'Daily Feedback',
  'Overall Program',
  'Future Staff Recruitment',
  'General / Other',
] as const;

export type SeedTemplate = {
  name: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  anonymity: 'anonymous' | 'identified';
  document: SurveyDocument;
};

const show = (questionId: string, ...values: string[]) => values.map((value) => ({ questionId, operator: 'equals' as const, value }));

function section(id: string, title: string, description: string, questions: Question[]): SurveySection {
  return { id, title, description, visibility: [], questions };
}

function rating(id: string, title: string, metric: string, required = true): Question {
  return { id, type: 'rating', title, description: '', required, reportingMetric: metric, visibility: [], scale: standardScale() };
}

function likert(id: string, title: string, metric: string): Question {
  return { id, type: 'likert', title, description: '', required: true, reportingMetric: metric, visibility: [], scale: standardScale(LIKERT_LABELS) };
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Standard Session Evaluation',
    description: 'Routine presentation feedback. Tokens use the session title, instructor, class, and date.',
    category: 'Instructional Sessions',
    anonymity: 'anonymous',
    document: {
      sections: [
        section(
          'session',
          '{{session_title}}',
          '{{instructor_name}} · {{session_date}} · {{class_name}}',
          [
            {
              id: 'session_quality',
              type: 'matrix',
              title: 'Rate this session',
              description: '1 is Poor and 5 is Excellent.',
              required: true,
              reportingMetric: 'session_quality',
              visibility: [],
              allowNa: true,
              rows: [
                { id: 'knowledge', label: 'Instructor knowledge' },
                { id: 'presentation', label: 'Presentation' },
                { id: 'relevance', label: 'Content relevance' },
                { id: 'instruction', label: 'Instruction quality' },
                { id: 'overall', label: 'Overall session quality' },
              ],
              columns: scaleColumns(RATING_LABELS),
            },
            likert('useful', 'The information presented will be useful in my role as a fire officer.', 'role_usefulness'),
            {
              id: 'time',
              type: 'single',
              title: 'The time allocated for this session was',
              description: '',
              required: true,
              reportingMetric: 'time_allocated',
              visibility: [],
              allowOther: false,
              choices: [
                { id: 'too-little', label: 'Too little' },
                { id: 'about-right', label: 'About right' },
                { id: 'too-much', label: 'Too much' },
              ],
            },
            {
              id: 'valuable',
              type: 'long_text',
              title: 'Most valuable information presented',
              description: '',
              required: false,
              reportingMetric: 'valuable_takeaway',
              visibility: [],
              minLength: 0,
              maxLength: 4000,
              placeholder: '',
            },
            {
              id: 'improvements',
              type: 'long_text',
              title: 'Recommended improvements',
              description: '',
              required: false,
              reportingMetric: 'improvements',
              visibility: [],
              minLength: 0,
              maxLength: 4000,
              placeholder: '',
            },
          ],
        ),
      ],
    },
  },
  {
    name: 'Meal Evaluation',
    description: 'Food and service for a meal that is not tied to a class session.',
    category: 'Food & Hospitality',
    anonymity: 'anonymous',
    document: {
      sections: [
        section('meal', 'Meal', '', [
          rating('quality', 'Meal quality', 'meal_quality'),
          rating('variety', 'Food variety', 'meal_variety'),
          {
            id: 'dietary',
            type: 'single',
            title: 'Were dietary needs accommodated?',
            description: '',
            required: true,
            reportingMetric: 'dietary_needs',
            visibility: [],
            allowOther: false,
            choices: [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
              { id: 'na', label: 'Not applicable' },
            ],
          },
          {
            id: 'comments',
            type: 'long_text',
            title: 'Additional comments',
            description: '',
            required: false,
            reportingMetric: 'meal_comments',
            visibility: [],
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
        ]),
      ],
    },
  },
  {
    name: 'Hotel Evaluation',
    description: 'Lodging questions appear only for students who stayed at the LDI hotel.',
    category: 'Facilities & Accommodations',
    anonymity: 'anonymous',
    document: {
      sections: [
        section('hotel', 'Hotel', '', [
          {
            id: 'stayed',
            type: 'yes_no',
            title: 'Did you stay at the LDI-provided hotel?',
            description: '',
            required: true,
            reportingMetric: 'stayed_at_hotel',
            visibility: [],
            yesLabel: 'Yes',
            noLabel: 'No',
          },
          {
            id: 'hotel_rating',
            type: 'matrix',
            title: 'Rate your stay',
            description: '',
            required: true,
            reportingMetric: 'hotel_experience',
            visibility: show('stayed', 'Yes'),
            allowNa: true,
            rows: [
              { id: 'cleanliness', label: 'Cleanliness' },
              { id: 'comfort', label: 'Comfort' },
              { id: 'amenities', label: 'Amenities' },
              { id: 'overall', label: 'Overall experience' },
            ],
            columns: scaleColumns(RATING_LABELS),
          },
          {
            id: 'problems',
            type: 'yes_no',
            title: 'Did you experience any problems?',
            description: '',
            required: true,
            reportingMetric: 'hotel_problems',
            visibility: show('stayed', 'Yes'),
            yesLabel: 'Yes',
            noLabel: 'No',
          },
          {
            id: 'problem_detail',
            type: 'long_text',
            title: 'Describe the problems',
            description: '',
            required: false,
            reportingMetric: 'hotel_problem_detail',
            visibility: show('problems', 'Yes'),
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
        ]),
      ],
    },
  },
  {
    name: 'Overall Program Evaluation',
    description: 'End-of-institute assessment for a program.',
    category: 'Overall Program',
    anonymity: 'anonymous',
    document: {
      sections: [
        section('overall', '{{event_name}}', '{{class_name}}', [
          rating('satisfaction', 'Overall satisfaction', 'overall_satisfaction'),
          rating('curriculum', 'Curriculum relevance', 'curriculum_relevance'),
          rating('instruction', 'Instructional quality', 'instructional_quality'),
          rating('facilities', 'Facilities', 'facilities'),
          rating('organization', 'Organization', 'organization'),
          rating('practical', 'Practical exercises', 'practical_exercises'),
          {
            id: 'time',
            type: 'single',
            title: 'Time allocated across the institute was',
            description: '',
            required: true,
            reportingMetric: 'program_time',
            visibility: [],
            allowOther: false,
            choices: [
              { id: 'too-little', label: 'Too little' },
              { id: 'about-right', label: 'About right' },
              { id: 'too-much', label: 'Too much' },
            ],
          },
          likert('prepared', 'I am better prepared to lead because of this institute.', 'leadership_preparedness'),
          likert('recommend', 'I would recommend NVFR LDI to a peer.', 'recommend'),
          {
            id: 'most',
            type: 'long_text',
            title: 'Most valuable portion of the institute',
            description: '',
            required: false,
            reportingMetric: 'most_valuable',
            visibility: [],
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
          {
            id: 'least',
            type: 'long_text',
            title: 'Least valuable portion of the institute',
            description: '',
            required: false,
            reportingMetric: 'least_valuable',
            visibility: [],
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
          {
            id: 'improvements',
            type: 'long_text',
            title: 'Suggested improvements',
            description: '',
            required: false,
            reportingMetric: 'program_improvements',
            visibility: [],
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
        ]),
      ],
    },
  },
  {
    name: 'Future Staff Interest',
    description: 'Identified recruitment survey. Name and contact are stored with the answers and shown only to administrators.',
    category: 'Future Staff Recruitment',
    anonymity: 'identified',
    document: {
      sections: [
        section('interest', 'Future staff', 'This survey is not anonymous. Leadership can see your name and contact details.', [
          {
            id: 'interested',
            type: 'single',
            title: 'Are you interested in serving as future LDI staff?',
            description: '',
            required: true,
            reportingMetric: 'staff_interest',
            visibility: [],
            allowOther: false,
            choices: [
              { id: 'yes', label: 'Yes' },
              { id: 'maybe', label: 'Maybe' },
              { id: 'no', label: 'No' },
            ],
          },
          {
            id: 'roles',
            type: 'multi',
            title: 'Preferred roles',
            description: '',
            required: true,
            reportingMetric: 'staff_roles',
            visibility: show('interested', 'Yes', 'Maybe'),
            allowOther: true,
            minSelect: 1,
            maxSelect: null,
            choices: [
              { id: 'instructor', label: 'Instructor' },
              { id: 'evaluator', label: 'Evaluator' },
              { id: 'company-mentor', label: 'Company mentor' },
              { id: 'command-mentor', label: 'Command mentor' },
              { id: 'logistics', label: 'Logistics' },
              { id: 'planning', label: 'Planning / administration' },
            ],
          },
          {
            id: 'experience',
            type: 'long_text',
            title: 'Relevant experience and skills',
            description: '',
            required: false,
            reportingMetric: 'staff_experience',
            visibility: show('interested', 'Yes', 'Maybe'),
            minLength: 0,
            maxLength: 4000,
            placeholder: '',
          },
          {
            id: 'full_name',
            type: 'short_text',
            title: 'Full name',
            description: '',
            required: true,
            reportingMetric: 'staff_name',
            visibility: show('interested', 'Yes', 'Maybe'),
            minLength: 0,
            maxLength: 200,
            placeholder: '',
          },
          {
            id: 'email',
            type: 'email',
            title: 'Preferred email',
            description: '',
            required: true,
            reportingMetric: 'staff_email',
            visibility: show('interested', 'Yes', 'Maybe'),
            placeholder: 'name@department.gov',
          },
          {
            id: 'phone',
            type: 'phone',
            title: 'Preferred phone',
            description: 'Optional.',
            required: false,
            reportingMetric: 'staff_phone',
            visibility: show('interested', 'Yes', 'Maybe'),
            placeholder: '',
          },
        ]),
      ],
    },
  },
];
