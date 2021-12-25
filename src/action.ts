// Packages
import * as core from '@actions/core';

// Ours
import { checkIssues } from './check';
import { getActionContext } from './context';

// Entry point
export async function start() {
	try {
		await checkIssues(await getActionContext());
	} catch (error) {
		if (!(error instanceof Error)) {
			return core.setFailed(`${error}`);
		}

		core.setFailed(error.stack || error.message);
	}
}
