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
		const dependencies = extractor.fromIssue(issue);

		const dependencyIssues = await Promise.all(
			dependencies.map(async (dep) => ({
				dep,
				issue: await resolver.get(dep),
			}))
		);

		const blockers = dependencyIssues
			.filter((data) => data.issue.state === 'open')
			.map((data) => data.dep);

		const isBlocked = blockers.length > 0;

		// Toggle label
		isBlocked
			? await manager.addLabel(issue)
			: await manager.removeLabel(issue);

		dependencies.length > 0
			? await manager.writeComment(
					issue,
					manager.generateComment(dependencies, blockers, config),
					!isBlocked
			  )
			: /* TODO: remove existing comments if any*/ null;

		await manager.updateCommitStatus(issue, blockers);
	}
}
