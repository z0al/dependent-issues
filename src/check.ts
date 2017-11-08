// Ours
import { ActionContext } from './types';

import {
	IssueLabeler,
	DependencyResolver,
	DependencyExtractor,
} from './helpers';

export async function checkIssues(context: ActionContext) {
	const { client, config, repo } = context;

	const labeler = new IssueLabeler(client, repo, config.label);
	const extractor = new DependencyExtractor(repo, config.keywords);
	const resolver = new DependencyResolver(client, context.issues, repo);

	for (const issue of context.issues) {
		const dependencies = extractor.fromIssue(issue);

		const dependencyIssues = await Promise.all(
			dependencies.map(resolver.get)
		);

		const blockers = dependencyIssues.filter(
			(depIssue) => depIssue.state === 'open'
		);

		blockers.length === 0
			? await labeler.remove(issue)
			: await labeler.add(issue);

		// TODO: update issue/PR comment and status
	}
}
