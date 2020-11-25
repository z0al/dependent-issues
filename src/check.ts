// Ours
import { ActionContext } from './types';

import {
	IssueManager,
	DependencyResolver,
	DependencyExtractor,
} from './helpers';

export async function checkIssues(context: ActionContext) {
	const { client, config, repo } = context;

	const manager = new IssueManager(client, repo, config);
	const extractor = new DependencyExtractor(repo, config.keywords);
	const resolver = new DependencyResolver(client, context.issues, repo);

	for (const issue of context.issues) {
		let dependencies = extractor.fromIssue(issue);

		if (dependencies.length === 0) {
			await manager.removeLabel(issue);
			await manager.removeAnyComments(issue);
			return await manager.updateCommitStatus(issue, []);
		}

		let isBlocked = false;

		dependencies = await Promise.all(
			dependencies.map(async (dep) => {
				const issue = await resolver.get(dep);
				if (issue.state === 'open') {
					isBlocked = true;
				}

				return { ...dep, blocker: issue.state === 'open' };
			})
		);

		// Toggle label
		isBlocked
			? await manager.addLabel(issue)
			: await manager.removeLabel(issue);

		await manager.writeComment(
			issue,
			manager.generateComment(dependencies, dependencies, config),
			!isBlocked
		);

		await manager.updateCommitStatus(issue, dependencies);
	}
}
