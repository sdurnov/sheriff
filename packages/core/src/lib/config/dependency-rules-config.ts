import { FsPath } from '../file-info/fs-path';

export interface DependencyCheckContext {
  fromModulePath: FsPath;
  toModulePath: FsPath;
  fromFilePath: FsPath;
  toFilePath: FsPath;
  fromTags: string[];
  toTags: string[];
}

// Backward compatible: supports both old signature (from, to as strings)
// and new signature (fromTags, toTags as arrays plus full context)
export type RuleMatcherFn = (
  context: { from: string; to: string } & Required<DependencyCheckContext>,
) => boolean;

export type RuleMatcher = string | null | RuleMatcherFn;
export type DependencyRulesConfig = Record<string, RuleMatcher | RuleMatcher[]>;
