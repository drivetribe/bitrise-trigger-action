import {warning as coreWarning, getInput as coreGetInput} from '@actions/core';
import {context} from '@actions/github';
import {getErrorString} from './UtilsHelper';

export interface Inputs {
  githubRepo: string;
  githubToken: string;
  pushBefore: string;
  pushAfter: string;
  prNumber: number;
  sha: string;
  event: string;
  tag: string;
  ref: string;
  configPath: string;
  configPathPr: string;
  configPathTag: string;
  bitriseToken: string;
  orgSlug: string;
  [key: string]: string | number;
}

/**
 * @function getInputs
 * @description reads the inputs to the action with core.getInput and returns object
 * @returns {Inputs} object of inputs for the github action
 */
export function getInputs(): Inputs {
  try {
    const githubToken =
      coreGetInput('repo-token', {required: true}) ||
      process.env.GITHUB_TOKEN ||
      false;
    if (!githubToken) {
      throw new Error(
        getErrorString(
          'getInputs Error',
          500,
          getInputs.name,
          'Received no repo-token, a repo-token is a requirement.',
        ),
      );
    }
    const bitriseToken = coreGetInput('bitrise-token', {required: true}) || '';
    if (!bitriseToken) {
      throw new Error(
        getErrorString(
          'getInputs Error',
          500,
          getInputs.name,
          'Received no bitrise-token, a bitrise-token is a requirement.',
        ),
      );
    }
    let prNumber;
    if (typeof context.issue.number !== 'undefined') {
      if (
        +coreGetInput('prNumber') !== context.issue.number &&
        coreGetInput('prNumber')
      ) {
        prNumber = +coreGetInput('prNumber');
      } else {
        prNumber = context.issue.number;
      }
    } else {
      prNumber = +coreGetInput('prNumber') || NaN;
    }
    let tag = '';
    const ref = context.ref;
    const tagPath = 'refs/tags/';
    if (ref && ref.startsWith(tagPath)) {
      tag = ref.replace(tagPath, '');
    }
    return {
      githubRepo: `${context.repo.owner}/${context.repo.repo}`,
      githubToken,
      pushBefore:
        context.payload.before === undefined ? false : context.payload.before,
      pushAfter:
        context.payload.after === undefined ? false : context.payload.after,
      prNumber,
      sha: context.sha,
      event: context.eventName,
      tag,
      ref,
      configPath: coreGetInput('config-path', {required: true}),
      configPathPr: coreGetInput('config-path-pr'),
      configPathTag: coreGetInput('config-path-tag'),
      bitriseToken,
      orgSlug: coreGetInput('bitrise-org-slug') || '',
    } as Inputs;
  } catch (error) {
    const eString = `Received an issue getting action inputs.`;
    const retVars = Object.fromEntries(
      Object.entries(process.env).filter(
        key =>
          key[0].includes('GITHUB') ||
          key[0].includes('INPUT_') ||
          key[0] === 'HOME',
      ),
    );
    throw new Error(
      getErrorString('getInputs Error', 500, getInputs.name, eString, retVars),
    );
  }
}

export interface Inferred {
  pr?: number;
  before?: string;
  after?: string;
  [key: string]: string | number | undefined;
}

/**
 * @function inferInput
 * @param before BASE commit sha to compare
 * @param after HEAD commit sha to compare
 * @param pr pr number to get changed files for
 * @returns {Inferred} object of inferred input for the action
 */
export function inferInput(
  before: string,
  after: string,
  pr: number,
): Inferred {
  const event = context.eventName;
  const weirdInput = `Received event from ${event}, but also received a before(${before}) or after(${after}) value.\n I am assuming you want to use a Push event but forgot something, so I'm giving you a message.`;
  const allInput = `Received event from ${event}, but received a before(${before}), after(${after}), and PR(${pr}).\n I am assuming you want to use one or the other but I am giving you Push.`;
  if (event === 'pull_request') {
    if (
      before &&
      after &&
      (before !== context.payload.before || after !== context.payload.after)
    )
      return {before, after}; // PR(push) - pull_request event with push inputs | PUSH
    if (before || after) coreWarning(weirdInput); // PR(push) - pull_request event with single push input | PR*
    return {pr}; // PR - pull_request event with no push inputs | PR
  }
  if (event === 'push') {
    if (pr) return {pr}; // Push(PR) - push event with pr inputs | PR
    return {before, after}; // Push - push event with no pr inputs | PUSH
  }
  if (pr) {
    if (before && after) {
      coreWarning(allInput); // Not PR or Push - all inputs | PUSH*
      if (event === 'issue_comment') return {before, after}; // If you explicitly set a before/after in an issue comment it will return those
      return {pr}; // Not PR or Push - pr inputs | PR if a PR before and after assume its a synchronize and return the whole PR
    }
    if (before || after) coreWarning(weirdInput); // Not PR or Push - pull_request event with single push input | PR*
    return {pr}; // Not PR or Push - pr inputs | PR
  }
  if (before || after) {
    if (!(before && after)) {
      const eString = `Received event from ${event}, but only received a before(${before}) or after(${after}).\n I need both of these if you want to use a Push event.`;
      throw new Error(
        getErrorString('inferInput Error', 500, inferInput.name, eString),
      );
    }
    return {before, after}; // Not PR or Push - push inputs | PUSH
  }
  const eString = `Received event from ${event}, but received no inputs. {event_name:${event}, pr: ${+pr}, before:${before}, after:${after}}`;
  throw new Error(
    getErrorString('inferInput Error', 500, inferInput.name, eString),
  );
}
