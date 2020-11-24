// Packages
import issueRegex from 'issue-regex';

// Ours
import { GithubClient, Issue } from '../types';
import {
	buildDependencyRegex,
	DependencyExtractor,
	DependencyResolver,
} from '../helpers';

test('buildDependencyRegex', () => {
	const regex = buildDependencyRegex(['depends on', 'blocked by']);

	expect(regex.flags).toEqual('gi');
	expect(regex.source).toEqual(
		`(?:depends on|blocked by)\\s+(${issueRegex().source})`
	);
});

describe('DependencyExtractor', () => {
	const repo = {
		owner: 'github',
		repo: 'atom',
	};

	const tests = [
		{
			title: 'empty string',
			text: '',
			expected: [],
		},
		{
			title: 'wrong keyword',
			text: 'depends on #2',
			expected: [],
		},
		{
			title: 'self-referencing',
			text: 'blocked by #1',
			expected: [],
		},
		{
			title: 'multiple dependencies',
			text: 'blocked by #2, blocked by #1 and blocked by #3',
			expected: [
				{
					...repo,
					number: 2,
				},
				{
					...repo,
					number: 3,
				},
			],
		},
		{
			title: 'duplicated issues',
			text: 'blocked by #2, blocked by #1 and blocked by #2',
			expected: [
				{
					...repo,
					number: 2,
				},
			],
		},
		{
			title: 'with full links',
			text:
				'blocked by github/atom#2, blocked by Microsoft/vscode#1 and blocked by #3',
			expected: [
				{
					...repo,
					number: 2,
				},
				{
					owner: 'Microsoft',
					repo: 'vscode',
					number: 1,
				},
				{
					...repo,
					number: 3,
				},
			],
		},
	];

	const extractor = new DependencyExtractor(repo, ['blocked by']);

	tests.forEach((t) => {
		it(t.title, () => {
			const issue = { body: t.text, number: 1 } as Issue;
			expect(extractor.fromIssue(issue)).toEqual(t.expected);
		});
	});
});

describe('DependencyResolver', () => {
	let gh: GithubClient;
	let issuesGet: jest.Mock<any, any>;
	let resolver: DependencyResolver;

	const repo = {
		owner: 'facebook',
		repo: 'react',
	};

	const contextIssues = [1, 2, 3].map((number) => ({
		title: `Issue ${number}`,
		number,
	})) as Issue[];

	beforeEach(() => {
		issuesGet = jest.fn();

		gh = {
			issues: {
				get: issuesGet as any,
			},
		} as GithubClient;

		resolver = new DependencyResolver(gh, contextIssues, repo);
	});

	it('resolves context issues', async () => {
		expect(
			await resolver.get({
				...repo,
				number: 1,
			})
		).toEqual({ number: 1, title: 'Issue 1' });
	});

	it('fetches unknown issues', async () => {
		const issue = { number: 4, title: 'Issue 4' };
		issuesGet.mockResolvedValue({ data: issue });

		const dependency = {
			...repo,
			number: 4,
		};

		const resolvedIssue = await resolver.get(dependency);

		expect(issuesGet).toHaveBeenCalledWith({
			...repo,
			issue_number: 4,
		});

		expect(resolvedIssue).toEqual(issue);
	});

	it('caches fetched issues', async () => {
		const issue = { number: 4, title: 'Issue 4' };
		issuesGet.mockResolvedValue({ data: issue });

		const dependency = {
			...repo,
			number: 4,
		};

		await resolver.get(dependency);
		await resolver.get(dependency);
		const resolvedIssue = await resolver.get(dependency);

		expect(resolvedIssue).toEqual(issue);
		expect(issuesGet).toHaveBeenCalledTimes(1);
	});
});
