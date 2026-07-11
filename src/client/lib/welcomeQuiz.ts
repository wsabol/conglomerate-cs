type ChoiceId = "a" | "b" | "c";

interface WelcomeQuizChoice {
  id: ChoiceId;
  text: string;
}

interface WelcomeQuizQuestion {
  prompt: string;
  choices: WelcomeQuizChoice[];
  correctChoiceId: ChoiceId;
}

export interface WelcomeQuiz {
  prompt: string;
  options: { value: string; label: string }[];
  correctValue: string;
}

const WELCOME_QUIZ_QUESTIONS: WelcomeQuizQuestion[] = [
  {
    prompt: "Funk is -",
    choices: [
      { id: "a", text: "its own reward" },
      { id: "b", text: "just okay" },
      { id: "c", text: "on the four" },
    ],
    correctChoiceId: "a",
  },
  {
    prompt: "When God falls asleep, you -",
    choices: [
      { id: "a", text: "wake him up with your Big Jazz Boy bugle blasts from below." },
      { id: "b", text: "do nothing." },
      { id: "c", text: "fall asleep and dream big dreams." },
    ],
    correctChoiceId: "a",
  },
  {
    prompt: "I remember -",
    choices: [
      { id: "a", text: "Clifford" },
      { id: "b", text: "The Alamo" },
      { id: "c", text: "9/11" },
    ],
    correctChoiceId: "a",
  },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildWelcomeQuiz(): WelcomeQuiz {
  const question =
    WELCOME_QUIZ_QUESTIONS[
      Math.floor(Math.random() * WELCOME_QUIZ_QUESTIONS.length)
    ];
  const shuffled = shuffle(question.choices);

  return {
    prompt: question.prompt,
    options: shuffled.map((choice) => ({
      value: choice.id,
      label: choice.text,
    })),
    correctValue: question.correctChoiceId,
  };
}

const WRONG_ANSWER_MESSAGES = [
  "Fired Bog for less.",
  "B*tch that's a mistake.",
  "You're out of your element!",
  "There aren't even good pentatonics.",
  "Real creative asshole...",
  "THe Broprophet is dead and you killed him."
] as const;

export function pickWrongAnswerMessage(): string {
  return WRONG_ANSWER_MESSAGES[
    Math.floor(Math.random() * WRONG_ANSWER_MESSAGES.length)
  ];
}
