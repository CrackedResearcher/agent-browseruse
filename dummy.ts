import type { FieldDescriptor } from "./types";

/**
 * Step 3: pick a value for each field with plain heuristics, no model involved.
 *
 * This exists so you can debug CDP, selectors and frames without wondering
 * whether the LLM is the thing that's broken. In step 4 you swap the call site
 * in automate.ts for a Gemini request that returns the same {selector -> value}
 * shape, and everything downstream stays identical.
 */

const PERSON = {
  first: "Ayush",
  last: "Kumar",
  full: "Ayush Kumar",
  email: "ayush.test+formfill@example.com",
  phone: "+15555550142",
  company: "Formfill QA",
  role: "Engineer",
  site: "https://example.com",
  subject: "Question about your product",
  message:
    "Hi, I came across your site and wanted to ask a couple of questions about " +
    "how you handle onboarding for smaller teams. What's the best way to get in touch?",
};

type Rule = [RegExp, string];

// First match wins, so order matters — narrow patterns before broad ones.
const RULES: Rule[] = [
  [/\b(e-?mail|correo)\b/i, PERSON.email],
  [/\b(phone|tel|mobile|contact ?number)\b/i, PERSON.phone],
  [/\b(first ?name|given ?name|fname)\b/i, PERSON.first],
  [/\b(last ?name|surname|family ?name|lname)\b/i, PERSON.last],
  [/\b(company|organi[sz]ation|business|employer)\b/i, PERSON.company],
  [/\b(job ?title|role|position)\b/i, PERSON.role],
  [/\b(website|url|domain|site)\b/i, PERSON.site],
  [/\b(subject|topic|reason|regarding)\b/i, PERSON.subject],
  [/\b(message|comment|enquiry|inquiry|question|details|how can we help)\b/i, PERSON.message],
  [/\b(name|full ?name)\b/i, PERSON.full],
];

export interface FillAction {
  frame: number;
  selector: string;
  action: "fill" | "select" | "check";
  value: string;
}

export function planFills(fields: FieldDescriptor[]): FillAction[] {
  const actions: FillAction[] = [];

  for (const f of fields) {
    const base = { frame: f.frame, selector: f.selector };
    const haystack = [f.name, f.id, f.placeholder, f.label, f.ariaLabel].join(" ");

    if (f.tag === "select") {
      // Skip the empty "Please choose…" option if there is one.
      const pick = f.options.find((o) => o.trim() !== "") ?? f.options[0];
      if (pick !== undefined) actions.push({ ...base, action: "select", value: pick });
      continue;
    }

    if (f.type === "checkbox") {
      // Consent / terms boxes usually need ticking for the form to submit.
      if (/\b(agree|consent|terms|privacy|policy|accept)\b/i.test(haystack)) {
        actions.push({ ...base, action: "check", value: "true" });
      }
      continue;
    }

    if (f.type === "radio") continue; // handled per-group, out of scope for the scaffold

    // Trust the input type before the field name — type="email" is unambiguous.
    let value: string | undefined;
    if (f.type === "email") value = PERSON.email;
    else if (f.type === "tel") value = PERSON.phone;
    else if (f.type === "url") value = PERSON.site;
    else if (f.tag === "textarea") value = PERSON.message;
    else value = RULES.find(([re]) => re.test(haystack))?.[1];

    if (value) actions.push({ ...base, action: "fill", value });
  }

  return actions;
}
