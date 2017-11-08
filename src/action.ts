// Packages
import * as core from '@actions/core';

// Ours
import { checkIssues } from './check';
import { getContext } from './context';

// Entry point
(async () => {
	try {
		await checkIssues(await getContext());
	} catch (error) {
		core.setFailed(error.message);
	}
})();
