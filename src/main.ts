import * as core from '@actions/core';
import * as github from '@actions/github';
import {getInputs, inferInput} from './InputHelper';
import {initClient, getChangedFiles} from './GithubHelper';
import * as yaml from 'js-yaml';
import {Minimatch, IMinimatch} from 'minimatch';

interface MatchConfig {
  all?: string[];
  any?: string[];
}

type StringOrMatchConfig = string | MatchConfig;

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    // parse input
    const inferred = inferInput(
      inputs.pushBefore,
      inputs.pushAfter,
      inputs.prNumber,
    );

    const client = initClient(inputs.githubToken);

    console.log('inputs', inputs);
    console.log('inferred', inferred);
    const changedFilesArray = await getChangedFiles(
      client,
      inputs.githubRepo,
      inferred,
    );
    changedFilesArray.forEach(githubFile =>
      console.log('filechange', githubFile.filename),
    );
    const labelGlobs: Map<string, StringOrMatchConfig[]> = await getLabelGlobs(
      client,
      inputs.configPath,
    );
    console.log('labelGlobs', labelGlobs);

    // const labels: string[] = [];
    // for (const [label, globs] of labelGlobs.entries()) {
    //   core.debug(`processing ${label}`);
    //   if (checkGlobs(changedFilesArray, globs)) {
    //     labels.push(label);
    //   }
    // }
    return;
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function getLabelGlobs(
  client: github.GitHub,
  configurationPath: string,
): Promise<Map<string, StringOrMatchConfig[]>> {
  const configurationContent: string = await fetchContent(
    client,
    configurationPath,
  );

  // loads (hopefully) a `{[label:string]: string | StringOrMatchConfig[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configurationContent);

  // transform `any` => `Map<string,StringOrMatchConfig[]>` or throw if yaml is malformed:
  return getLabelGlobMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string,
): Promise<string> {
  console.log('fetch content', github.context.sha);
  const response: any = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha,
  });

  return Buffer.from(response.data.content, response.data.encoding).toString();
}

function getLabelGlobMapFromObject(
  configObject: any,
): Map<string, StringOrMatchConfig[]> {
  const labelGlobs: Map<string, StringOrMatchConfig[]> = new Map();
  for (const label in configObject) {
    if (typeof configObject[label] === 'string') {
      labelGlobs.set(label, [configObject[label]]);
    } else if (configObject[label] instanceof Array) {
      labelGlobs.set(label, configObject[label]);
    } else {
      throw Error(
        `found unexpected type for label ${label} (should be string or array of globs)`,
      );
    }
  }

  return labelGlobs;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkGlobs(
  changedFiles: string[],
  globs: StringOrMatchConfig[],
): boolean {
  for (const glob of globs) {
    core.debug(` checking pattern ${JSON.stringify(glob)}`);
    const matchConfig = toMatchConfig(glob);
    if (checkMatch(changedFiles, matchConfig)) {
      return true;
    }
  }
  return false;
}

function isMatch(changedFile: string, matchers: IMinimatch[]): boolean {
  core.debug(`    matching patterns against file ${changedFile}`);
  for (const matcher of matchers) {
    core.debug(`   - ${printPattern(matcher)}`);
    if (!matcher.match(changedFile)) {
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

run();
