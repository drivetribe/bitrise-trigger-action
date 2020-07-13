/**
 * https://devcenter.bitrise.io/api/api-index/
 * https://api-docs.bitrise.io/
 */

import {Inputs} from './InputHelper';
import * as httpm from '@actions/http-client';
const http: httpm.HttpClient = new httpm.HttpClient('bitrise-trigger-action');

const BASE_URL = 'https://api.bitrise.io/v0.1';

// TODO: handle errors
export async function triggerWorkflows(
  appNames: string[],
  inputs: Inputs,
): Promise<boolean> {
  const apps = await getBitriseApps(inputs);

  const results: number[] = [];
  for (const appName of appNames) {
    const appSlug = getSlugFromAppTitle(appName, apps);
    if (appSlug) {
      await triggerBuild(appSlug, inputs).then(res =>
        results.push(res.message.statusCode),
      );
    }
  }
  return Promise.resolve(
    results.length > 0
      ? results.some((code: number): boolean => code !== 200)
      : false,
  );
}

async function getBitriseApps(inputs: Inputs): Promise<any> {
  const url = inputs.orgSlug
    ? `${BASE_URL}/organizations/${inputs.orgSlug}/apps`
    : `${BASE_URL}/apps`;
  return http.get(url, {Authorization: inputs.bitriseToken}).then(
    async (res: any): Promise<any> => {
      const body: string = await res.readBody();
      return JSON.parse(body);
    },
  );
}

async function triggerBuild(appSlug: string, inputs: Inputs): Promise<any> {
  console.log('triggerBuild', inputs.event, inputs.prNumber);
  return await http
    .postJson(`${BASE_URL}/apps/${appSlug}/builds`, getTriggerBody(inputs), {
      Authorization: inputs.bitriseToken,
    })
    .then(
      async (res: any): Promise<boolean> => {
        console.log('trigger response', res);
        return res?.message?.statusCode === 200;
      },
    );
}

function getSlugFromAppTitle(
  appTitle: string,
  apps: {data: {slug: string; title: string}[]} | null,
): string | null {
  const appObj = apps?.data.find(app => app.title === appTitle);
  return appObj?.slug || null;
}

function getTriggerBody({context, prNumber}: Inputs): any {
  let build_params = {};
  if (prNumber) {
    build_params = {
      commit_hash: context.sha,
      commit_message: '',
      branch: context.payload?.pull_request?.head?.ref,
      branch_repo_owner: context.payload?.pull_request?.head?.owner?.login,
      branch_dest: context.payload?.pull_request?.base?.ref,
      branch_dest_repo_owner: context.payload?.pull_request?.base?.owner?.login,
      pull_request_id: prNumber,
      pull_request_repository_url: context.payload?.repository?.git_url,
      pull_request_merge_branch: `pull/${prNumber}/merge`,
      pull_request_head_branch: `pull/${prNumber}/head`,
      pull_request_author: context.actor,
      diff_url: context.payload?.pull_request?.diff_url,
    };
  } else {
    build_params = {
      commit_hash: context.sha,
      commit_message: '',
      // branch: 'feature/platform_subs',
      branch_repo_owner: context.payload?.repository?.owner.login,
    };
  }
  console.log('build_params', build_params);
  return {
    payload: {
      hook_info: {
        type: 'bitrise',
      },
      build_params,
    },
  };
}
