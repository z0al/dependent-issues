// Packages
import * as core from '@actions/core';
import * as github from '@actions/github';

// Ours
import { ActionContext, GithubClient, Issue } from './types';

export async function getActionContext(): Promise<ActionContext> {
	core.startGroup('Context');

	const config = {
		actionName: 'Dependent Issues',
		commentBody: core.getInput('comment'),
		commentSignature:
			'<!-- By Dependent Issues (Action) - DO NOT REMOVE -->',
		label: core.getInput('label'),
		check_issues: core.getInput('check_issues'),
		ignore_dependabot: core.getInput('ignore_dependabot'),
		keywords: core
			.getInput('keywords')
			.trim()
			.split(',')
			.map((kw) => kw.trim()),
	};

	if (config.keywords.length === 0) {
		throw new Error('invalid keywords');
	}

	if (!process.env.GITHUB_TOKEN) {
		throw new Error('env.GITHUB_TOKEN must not be empty');
	}

	const client = github.getOctokit(
		process.env.GITHUB_TOKEN
	) as unknown as GithubClient;

	const readOnlyClient = github.getOctokit(
		process.env.GITHUB_READ_TOKEN || process.env.GITHUB_TOKEN
	) as unknown as GithubClient;

	const { issue, repo } = github.context;

	let issues: Issue[] = [];

	// If we are running in an issue context then only run checks
	// for the issue in question. Unless, it's a close event because
	// then the issue could be a dependency of another PR/issue.
	if (issue?.number) {
		core.info(`Payload issue: #${issue?.number}`);
		const remoteIssue = (
			await client.rest.issues.get({
				...repo,
				issue_number: issue.number,
			})
		).data;

		// Ignore closed PR/issues
		if (remoteIssue.state === 'open') {
			issues = [remoteIssue];
		}
	}

	// Otherwise, check all open issues
	if (issues.length === 0) {
		core.info(`Payload issue: None or closed`);
		const options = {
			...repo,
			state: 'open' as 'open',
			per_page: 100,
		};

		const method: any =
			config.check_issues === 'on'
				? client.rest.issues.listForRepo
				: client.rest.pulls.list;

		issues = (await client.paginate(method, options)) as Issue[];
		core.info(`No. of open issues: ${issues.length}`);
	}

	core.endGroup();

	return {
		client,
		readOnlyClient,
		config,
		repo,
		issues,
	};
}
