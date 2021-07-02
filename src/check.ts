// Packages
import * as core from '@actions/core';

// Ours
import { ActionContext } from './types';
import { isSupported } from './support';

import {
	IssueManager,
	DependencyResolver,
	DependencyExtractor,
	formatDependency,
} from './helpers';

export async function checkIssues(context: ActionContext) {
	const { client, readOnlyClient, config, repo } = context;

	const manager = new IssueManager(client, repo, config);
	const extractor = new DependencyExtractor(repo, config.keywords);
	const resolver = new DependencyResolver(client, readOnlyClient, context.issues, repo);

	for (const issue of context.issues) {
		core.startGroup(`Checking #${issue.number}`);

		if (!isSupported(issue)) {
			core.info('Unsupported issue or pull request. Skipped');
			core.endGroup();
			continue;
		}

		let dependencies = extractor.fromIssue(issue);

		if (dependencies.length === 0) {
			core.info('No dependencies found. Running clean-up');
			await manager.removeLabel(issue);
			await manager.removeActionComments(issue);
			await manager.updateCommitStatus(issue, []);

			core.endGroup();
			continue;
		}

		let isBlocked = false;

		core.info(
			`Depends on: ${dependencies
				.map((dep) => formatDependency(dep, repo))
				.join(', ')}`
		);

		dependencies = await Promise.all(
			dependencies.map(async (dep) => {
				const issue = await resolver.get(dep);
				if (issue.state === 'open') {
					isBlocked = true;
				}

				return { ...dep, blocker: issue.state === 'open' };
			})
		);

		core.info(
			`Blocked by: ${dependencies
				.filter((dep) => dep.blocker)
				.map((dep) => formatDependency(dep, repo))
				.join(', ')}`
		);

		core.info('Updating labels');
		// Toggle label
		isBlocked
			? await manager.addLabel(issue)
			: await manager.removeLabel(issue);

		core.info('Updating Action comments');
		await manager.writeComment(
			issue,
			manager.generateComment(dependencies, dependencies, config),
			!isBlocked
		);

		core.info(
			`Updating PR status${issue.pull_request ? '' : '. Skipped'}`
		);
		await manager.updateCommitStatus(issue, dependencies);
		core.endGroup();
	}
}
