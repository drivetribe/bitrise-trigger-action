/**
 * https://devcenter.bitrise.io/api/api-index/
 * https://api-docs.bitrise.io/
 */

import {Inputs} from './InputHelper';
import * as httpm from '@actions/http-client';
const http: httpm.HttpClient = new httpm.HttpClient('bitrise-trigger-action');

const BASE_URL = 'https://api.bitrise.io/v0.1';

export async function triggerWorkflows(
  workflows: string[],
  inputs: Inputs,
): Promise<boolean> {
  const apps = await getBitriseApps(inputs);
  console.log('bitrise apps', apps);
  // const results: number[] = [];
  // workflows.forEach(() => {
  //   await triggerBuild('', inputs).then(res =>
  //     results.push(res.message.statusCode),
  //   );
  // });
  // results.length > 0 ? results.includes(code => code !== 200) : false,
  return Promise.resolve(false);
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
            commit_hash: inputs.sha,
            pull_request_id: inputs.prNumber,
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
