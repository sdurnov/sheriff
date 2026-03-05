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
// and new signature (fromTags, toTags as arrays)
export type RuleMatcherFn = (
  context: { from: string; to: string; fromTags: string[]; toTags: string[]; fromModulePath: FsPath; toModulePath: FsPath; fromFilePath: FsPath; toFilePath: FsPath },
) => boolean;

export type RuleMatcher = string | null | RuleMatcherFn;
export type DependencyRulesConfig = Record<string, RuleMatcher | RuleMatcher[]>;
