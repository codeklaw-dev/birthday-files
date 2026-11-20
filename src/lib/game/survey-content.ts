/**
 * "Before the party" questions that party guests answer on the invite.
 * Their answers become the answer key for "How Well Do You Know Mez?":
 * virtual troopers score by matching what most guests said.
 *
 * Opinion questions ("which would Mez pick?"), so they make no claims about
 * her. There are no right answers here, so this file is safe to send to phones.
 */
export interface SurveyQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "s1",
    prompt: "Midnight snack: which would Mez pick?",
    options: ["Biryani", "Pizza", "Instant noodles", "Chocolate"],
  },
  {
    id: "s2",
    prompt: "Dream day off: which would Mez pick?",
    options: ["Beach", "Mountains", "Shopping", "Bed, all day"],
  },
  {
    id: "s3",
    prompt: "Birthday treat: which would Mez pick?",
    options: ["A surprise trip", "A big party", "A cosy dinner", "A shopping spree"],
  },
];
