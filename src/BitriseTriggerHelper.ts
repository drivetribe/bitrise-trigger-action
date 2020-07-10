/**
 * https://devcenter.bitrise.io/api/api-index/
 * https://api-docs.bitrise.io/
 */

import {Inputs} from './InputHelper';
import * as httpm from '@actions/http-client';
const http: httpm.HttpClient = new httpm.HttpClient('bitrise-trigger-action');

const BASE_URL = 'https://api.bitrise.io/v0.1';

export async function triggerWorkflows(
  appNames: string[],
  inputs: Inputs,
): Promise<boolean> {
  const apps = await getBitriseApps(inputs);
  console.log('bitrise apps', apps);

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function triggerBuild(appSlug: string, inputs: Inputs): Promise<any> {
  console.log('triggerBuild', inputs.event, inputs.prNumber);
  return await http
    .postJson(
      `${BASE_URL}/apps/${appSlug}/builds`,
      {
        payload: {
          hook_info: {
            type: 'bitrise',
          },
          build_params: {
            branch: 'master',
            // commit_hash: inputs.sha,
            // pull_request_id: inputs.prNumber,
          },
        },
      },
      {Authorization: inputs.bitriseToken},
    )
    .then(
      async (res: any): Promise<any> => {
        const body: string = await res.readBody();
        return JSON.parse(body);
      },
    );
}

function getSlugFromAppTitle(
  appTitle: string,
  apps: {slug: string; title: string}[],
): string | null {
  const appObj = apps.find(app => app.title === appTitle);
  return appObj ? appObj.slug : null;
}
