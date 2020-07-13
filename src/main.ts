import * as core from '@actions/core';
import {getInputs, inferInput} from './InputHelper';
import {initClient, getChangedFiles} from './GithubHelper';
import {
  getWorkflowGlobs,
  checkGlobs,
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
      // TODO: check tag regex
      return;
    }

    const changedFiles = await getChangedFiles(
      client,
      inputs.githubRepo,
      inferred,
    );
    const changedFilesArray = changedFiles.map(
      githubFile => githubFile.filename,
    );

    const triggerConfig = inferred.pr ? inputs.configPathPr : inputs.configPath;
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

    triggerWorkflows(workflowsToTrigger, inputs);
    return;
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
