// Ours
import { Issue } from './types';

/**
 * Workflows triggered by Dependabot PRs will run with read-only
 * permissions. We need to ignore them.
 *
 * https://bit.ly/2NDzjUM
 */
function isDependabotPR(issue: Issue) {
	return issue.user?.login === 'dependabot[bot]';
}

export function isSupported(issue: Issue) {
	return !isDependabotPR(issue);
}
