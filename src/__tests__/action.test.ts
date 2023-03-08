// Ours
import * as action from '../action';
import { ActionContext, GithubClient } from '../types';

var gh: GithubClient;
var inputs: ActionContext['config'];

// Mock @actions modules
jest.mock('@actions/core', () => {
	inputs = {
		label: 'dependent',
		issues: 'off',
		keywords: 'depends on, blocked by',
		comment: 'This PR/issue depends on:\n\n{{ dependencies }}',
	} as any;

	return {
		getInput: jest
			.fn()
			.mockImplementation((key: string) => (inputs as any)[key]),
		info: jest.fn(),
		startGroup: jest.fn(),
		endGroup: jest.fn(),
	};
});

jest.mock('@actions/github', () => {
	gh = {
		rest: {
			pulls: {
				get: jest.fn().mockResolvedValue({
					data: {
						head: { sha: '<commit-sha>' },
					},
				}) as any,
				list: jest.fn().mockResolvedValue([
					{
						number: 1,
						body: 'This work depends on #2 and blocked by user/another-repo#3',
						pull_request: {},
						labels: [{ name: 'bug' }],
					},
					{
						number: 2,
						pull_request: {},
						body: 'This work does not depend on anything',
						labels: [],
						state: 'open',
					},
				]) as any,
			},
			issues: {
				get: jest.fn().mockResolvedValue({
					data: {
						number: 3,
						state: 'open',
					},
				}) as any,
				addLabels: jest.fn() as any,
				createComment: jest.fn() as any,
				listComments: jest.fn().mockResolvedValue([]) as any,
			},
			repos: {
				createCommitStatus: jest.fn() as any,
			},
		},
		paginate: jest.fn().mockImplementation((fn, opt) => {
			const { per_page: _, ...rest } = opt;
			return fn(rest);
		}) as any,
	} as GithubClient;

	return {
		context: {
			repo: { owner: 'owner', repo: 'repo' },
			issue: {},
		},
		getOctokit: jest.fn().mockReturnValue(gh),
	};
});

process.env.GITHUB_TOKEN = '<token>';

test('it works in default config', async () => {
	// Trigger action
	await action.start();

	expect(gh.rest.issues.createComment).toHaveBeenCalledWith({
		issue_number: 1,
		owner: 'owner',
		repo: 'repo',
		body: `This PR/issue depends on:

* owner/repo#2
* user/another-repo#3
<!-- By Dependent Issues (Action) - DO NOT REMOVE -->`,
	});

	expect(gh.rest.issues.createComment).toHaveBeenCalledTimes(1);

	expect(gh.rest.issues.addLabels).toHaveBeenCalledWith({
		owner: 'owner',
		repo: 'repo',
		issue_number: 1,
		labels: ['dependent'],
	});

	expect(gh.rest.issues.addLabels).toHaveBeenCalledTimes(1);

	expect(gh.rest.repos.createCommitStatus).toHaveBeenCalledWith({
		owner: 'owner',
		repo: 'repo',
		description: 'Blocked by #2 and 1 more issues',
		state: 'failure',
		context: 'Dependent Issues',
		sha: '<commit-sha>',
	});

	expect(gh.rest.repos.createCommitStatus).toHaveBeenCalledWith({
		owner: 'owner',
		repo: 'repo',
		description: 'No dependencies',
		state: 'success',
		context: 'Dependent Issues',
		sha: '<commit-sha>',
	});

	expect(gh.rest.repos.createCommitStatus).toHaveBeenCalledTimes(2);
});
