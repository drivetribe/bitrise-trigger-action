import * as core from '@actions/core';
import {getInputs, inferInput} from './InputHelper';
import {initClient, getChangedFiles} from './GithubHelper';
import {
  checkGlobs,
  checkTagGlobs,
  getWorkflowGlobs,
  StringOrMatchConfig,
} from './FilesChangedHelper';
import {triggerWorkflows} from './BitriseTriggerHelper';

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

    if (inputs.tag) {
      const workflowGlobs: Map<
        string,
        StringOrMatchConfig[]
      > = await getWorkflowGlobs(client, inputs.configPathTag);

      const workflowsToTrigger: string[] = [];
      for (const [workflow, globs] of workflowGlobs.entries()) {
        core.debug(`processing ${workflow}`);
        if (checkTagGlobs(inputs.tag, globs)) {
          workflowsToTrigger.push(workflow);
        }
      }

      if (workflowsToTrigger.length) {
        triggerWorkflows(workflowsToTrigger, inputs);
      } else {
        console.log('No changes detected, build skipped');
      }
      return;
    } else {
      const changedFiles = await getChangedFiles(
        client,
        inputs.githubRepo,
        inferred,
      );
      const changedFilesArray = changedFiles.map(
        githubFile => githubFile.filename,
      );

      const triggerConfig = inferred.pr
        ? inputs.configPathPr
        : inputs.configPath;
      const workflowGlobs: Map<
        string,
        StringOrMatchConfig[]
      > = await getWorkflowGlobs(client, triggerConfig);

      const workflowsToTrigger: string[] = [];
      for (const [workflow, globs] of workflowGlobs.entries()) {
        core.debug(`processing ${workflow}`);
        if (checkGlobs(changedFilesArray, globs)) {
          workflowsToTrigger.push(workflow);
        }
      }

      if (workflowsToTrigger.length) {
        triggerWorkflows(workflowsToTrigger, inputs);
      } else {
        console.log('No changes detected, build skipped');
      }
      return;
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
