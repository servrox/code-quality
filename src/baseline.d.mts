export interface Finding {
  file: string;
  rule: string;
  message: string;
  value: number;
}

interface Baseline {
  version: 1;
  entries: Record<string, number[]>;
}

interface Regression extends Finding {
  allowed: number;
}

export declare const normalizeLint: (input: unknown) => Finding[];
export declare const normalizeKnip: (input: unknown) => Finding[];
export declare const createBaseline: (findings: readonly Finding[]) => Baseline;
export declare const findRegressions: (
  findings: readonly Finding[],
  input: unknown
) => Regression[];
