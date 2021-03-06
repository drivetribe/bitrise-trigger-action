import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';
import {Minimatch, IMinimatch} from 'minimatch';

export interface MatchConfig {
  all?: string[];
  any?: string[];
}

export type StringOrMatchConfig = string | MatchConfig;

export async function getWorkflowGlobs(
  client: github.GitHub,
  configPath: string,
): Promise<Map<string, StringOrMatchConfig[]>> {
  const configContent: string = await fetchContent(client, configPath);

  // loads (hopefully) a `{[workflow:string]: string | StringOrMatchConfig[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configContent);

  // transform `any` => `Map<string,StringOrMatchConfig[]>` or throw if yaml is malformed:
  return getWorkflowGlobMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string,
): Promise<string> {
  const response: any = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha,
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
}

function getWorkflowGlobMapFromObject(
  configObject: any,
): Map<string, StringOrMatchConfig[]> {
  const workflowGlobs: Map<string, StringOrMatchConfig[]> = new Map();
  for (const workflow in configObject) {
    if (typeof configObject[workflow] === 'string') {
      workflowGlobs.set(workflow, [configObject[workflow]]);
    } else if (configObject[workflow] instanceof Array) {
      workflowGlobs.set(workflow, configObject[workflow]);
    } else {
      throw Error(
        `found unexpected type for workflow ${workflow} (should be string or array of globs)`,
      );
    }
  }

  return workflowGlobs;
}

function toMatchConfig(config: StringOrMatchConfig): MatchConfig {
  if (typeof config === 'string') {
    return {
      any: [config],
    };
  }

  return config;
}

function printPattern(matcher: IMinimatch): string {
  return (matcher.negate ? '!' : '') + matcher.pattern;
}

export function checkGlobs(
  changedFiles: string[],
  globs: StringOrMatchConfig[],
): boolean {
  for (const glob of globs) {
    core.debug(`checking pattern ${JSON.stringify(glob)}`);
    const matchConfig = toMatchConfig(glob);
    if (checkMatch(changedFiles, matchConfig)) {
      return true;
    }
  }
  return false;
}

export function checkTagGlobs(
  tag: string,
  globs: StringOrMatchConfig[],
): boolean {
  for (const glob of globs) {
    core.debug(`checking pattern ${JSON.stringify(glob)}`);
    const matchConfig = toMatchConfig(glob);
    if (matchConfig.any !== undefined) {
      if (!checkAnyTagGlobs(tag, matchConfig.any)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function checkAnyTagGlobs(tag: string, globs: string[]): boolean {
  const matchers = globs.map(g => new Minimatch(g));
  return isMatch(tag, matchers);
}

function isMatch(changedFileOrTag: string, matchers: IMinimatch[]): boolean {
  core.debug(`    matching patterns against file or tag ${changedFileOrTag}`);
  for (const matcher of matchers) {
    core.debug(`   - ${printPattern(matcher)}`);
    if (!matcher.match(changedFileOrTag)) {
      core.debug(`   ${printPattern(matcher)} did not match`);
      return false;
    }
  }

  core.debug(`   all patterns matched`);
  return true;
}

// equivalent to "Array.some()" but expanded for debugging and clarity
function checkAny(changedFiles: string[], globs: string[]): boolean {
  const matchers = globs.map(g => new Minimatch(g));
  core.debug(`  checking "any" patterns`);
  for (const changedFile of changedFiles) {
    if (isMatch(changedFile, matchers)) {
      core.debug(`  "any" patterns matched against ${changedFile}`);
      return true;
    }
  }

  core.debug(`  "any" patterns did not match any files`);
  return false;
}

// equivalent to "Array.every()" but expanded for debugging and clarity
function checkAll(changedFiles: string[], globs: string[]): boolean {
  const matchers = globs.map(g => new Minimatch(g));
  core.debug(` checking "all" patterns`);
  for (const changedFile of changedFiles) {
    if (!isMatch(changedFile, matchers)) {
      core.debug(`  "all" patterns did not match against ${changedFile}`);
      return false;
    }
  }

  core.debug(`  "all" patterns matched all files`);
  return true;
}

function checkMatch(changedFiles: string[], matchConfig: MatchConfig): boolean {
  if (matchConfig.all !== undefined) {
    if (!checkAll(changedFiles, matchConfig.all)) {
      return false;
    }
  }

  if (matchConfig.any !== undefined) {
    if (!checkAny(changedFiles, matchConfig.any)) {
      return false;
    }
  }

  return true;
}
