export interface Env {
  BROWSER: Fetcher;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  // Not used until step 4 (Gemini call). Kept here so wiring it up is a one-liner.
  GEMINI_API_KEY?: string;
}

/** A single form control, described well enough for a model to reason about. */
export interface FieldDescriptor {
  /** Index into page.frames() — a field may live inside an embedded form iframe. */
  frame: number;
  selector: string;
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  required: boolean;
  options: string[];
}

export interface SubmitDescriptor {
  frame: number;
  selector: string;
  text: string;
}

export type Send = (event: string, data: unknown) => Promise<void>;
