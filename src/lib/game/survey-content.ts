/**
 * "Before the party" questions that party guests answer on the invite.
 * Their answers become the answer key for "How Well Do You Know Mez?":
 * virtual troopers score by matching what most guests said.
 *
 * SAMPLE CONTENT: replace with the real questions. There are no right
 * answers here, so this file is safe to send to phones.
 */
export interface SurveyQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "s1",
    prompt: "What's Mez's go-to comfort food?",
    options: ["Biryani", "Pizza", "Instant noodles", "Chocolate"],
  },
  {
    id: "s2",
    prompt: "Where would Mez rather spend a day off?",
    options: ["Beach", "Mountains", "Shopping", "Bed, all day"],
  },
  {
    id: "s3",
    prompt: "What's Mez's best quality?",
    options: ["Kindness", "Humour", "Loyalty", "Honesty"],
  },
];
