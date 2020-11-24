// Packages
import * as core from '@actions/core';
import * as github from '@actions/github';

// Ours
import { ActionContext, Issue } from './types';

export async function getActionContext(): Promise<ActionContext> {
	const config = {
		actionName: 'Dependent Issues',
		actionRepoURL: 'https://github.com/z0al/dependent-issues',
		commentSignature:
			'<!-- By Dependent Issues (Action) - DO NOT REMOVE -->',
		label: core.getInput('label'),
		issues: core.getInput('issues'),
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

	const client = github.getOctokit(process.env.GITHUB_TOKEN);

	const { issue, repo } = github.context;

	let issues: Issue[] = [];

	// Only run checks for the context.issue (if any)
	if (issue.number) {
		issues = [
			(await client.issues.get({ ...repo, issue_number: issue.number }))
				.data,
		];
	}

	// Otherwise, check all open issues
	if (issues.length === 0) {
		const options = {
			...repo,
			state: 'open' as 'open',
			per_page: 100,
		};

		const method =
			config.issues === 'on'
				? client.issues.listForRepo
				: client.pulls.list;

		issues = (await client.paginate(method, options)) as Issue[];
	}

	return {
		client,
		config,
		repo,
		issues,
	};
}
