// Packages
import issueRegex from 'issue-regex';

// Ours
import { ActionContext, GithubClient, Issue } from '../types';
import {
	createDependencyRegex,
	DependencyExtractor,
	DependencyResolver,
	IssueManager,
	formatDependency,
} from '../helpers';

test('createDependencyRegex', () => {
	const regex = createDependencyRegex(['depends on', 'blocked by']);

	expect(regex.flags).toEqual('gi');
	expect(regex.source).toEqual(
		`(?:depends on|blocked by)\\s+(${issueRegex().source})`
	);
});

test('formatDependency', () => {
	const repo = { owner: 'owner', repo: 'repo' };
	const dep = { ...repo, number: 141 };

	expect(formatDependency(dep)).toEqual('owner/repo#141');
	expect(formatDependency(dep, repo)).toEqual('#141');
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

describe('IssueManager', () => {
	let gh: GithubClient;
	let manager: IssueManager;

	const repo = {
		owner: 'Microsoft',
		repo: 'vscode',
	};

	const config = {
		actionName: 'my-action',
		label: 'my-label',
		commentSignature: '<action-signature>',
	} as ActionContext['config'];

	let listComments: jest.Mock<any, any>;

	beforeEach(() => {
		listComments = jest.fn();

		gh = {
			paginate: jest
				.fn()
				.mockImplementation((_, options) =>
					listComments(options)
				) as any,
			issues: {
				addLabels: jest.fn() as any,
				removeLabel: jest.fn() as any,
				listComments: listComments as any,
				deleteComment: jest.fn() as any,
				updateComment: jest.fn() as any,
				createComment: jest.fn() as any,
			},
			pulls: {
				get: jest.fn() as any,
			},
			repos: {
				createCommitStatus: jest.fn() as any,
			},
		} as GithubClient;

		manager = new IssueManager(gh, repo, config);
	});

	describe('updateCommitStatus', () => {
		const pr = {
			head: {
				sha: '<commit-sha>',
			},
		};

		beforeEach(() => {
			((gh.pulls.get as unknown) as jest.Mock<
				any,
				any
			>).mockResolvedValue({ data: pr });
		});

		it('ignores non-PRs', async () => {
			const issue = {} as any;
			await manager.updateCommitStatus(issue, []);
			expect(gh.pulls.get).not.toHaveBeenCalled();
			expect(gh.repos.createCommitStatus).not.toHaveBeenCalled();
		});

		it('sets the correct status on success', async () => {
			const issue = { number: 141, pull_request: {} } as any;

			await manager.updateCommitStatus(issue, []);

			expect(gh.pulls.get).toHaveBeenCalledWith({
				...repo,
				pull_number: issue.number,
			});

			expect(gh.repos.createCommitStatus).toHaveBeenCalledWith({
				...repo,
				description: 'All listed issues are closed',
				state: 'success',
				sha: pr.head.sha,
				context: config.actionName,
			});
		});

		it('sets the correct status on pending', async () => {
			const issue = { number: 141, pull_request: {} } as any;

			await manager.updateCommitStatus(issue, [
				{ repo: 'repo', owner: 'owner', number: 999 },
				{} as any, // shouldn't be used
				{} as any, // shouldn't be used
			]);

			expect(gh.pulls.get).toHaveBeenCalledWith({
				...repo,
				pull_number: issue.number,
			});

			expect(gh.repos.createCommitStatus).toHaveBeenCalledWith({
				...repo,
				description: 'Blocked by owner/repo#999 and 2 more issues',
				state: 'pending',
				sha: pr.head.sha,
				context: config.actionName,
			});
		});
	});

	describe('writeComment', () => {
		const comments = [
			{ id: 1, body: 'Random text' },
			{
				id: 2,
				body: `  Existing text\t\n${config.commentSignature}\n\n `,
			},
			{ id: 3, body: 'Random text' },
			{ id: 4, body: 'Random text' },
		];

		beforeEach(() => {
			listComments.mockResolvedValue(comments);
		});

		it('updates existing comment', async () => {
			const text = ' This is the updated text\n';
			const issue = { number: 141 } as any;
			await manager.writeComment(issue, text);

			expect(gh.paginate).toHaveBeenCalled();

			expect(gh.issues.listComments).toHaveBeenCalledWith(
				expect.objectContaining({
					...repo,
					issue_number: issue.number,
				})
			);

			expect(gh.issues.updateComment).toHaveBeenCalledWith({
				...repo,
				body: text.trim() + '\n' + config.commentSignature,
				comment_id: 2,
			});

			expect(gh.issues.deleteComment).not.toHaveBeenCalled();
			expect(gh.issues.createComment).not.toHaveBeenCalled();
		});

		it('creates a new comment if required', async () => {
			const text = ' This is the updated text\n';
			const issue = { number: 141 } as any;
			await manager.writeComment(issue, text, true);

			expect(gh.paginate).toHaveBeenCalled();

			expect(gh.issues.listComments).toHaveBeenCalledWith({
				...repo,
				issue_number: issue.number,
				per_page: 100,
			});

			expect(gh.issues.deleteComment).toHaveBeenCalledWith({
				...repo,
				comment_id: 2,
			});

			expect(gh.issues.createComment).toHaveBeenCalledWith({
				...repo,
				issue_number: issue.number,
				body: text.trim() + '\n' + config.commentSignature,
			});

			expect(gh.issues.updateComment).not.toHaveBeenCalled();
		});

		it('exits early if the text is the same', async () => {
			const text = 'Existing text';
			const issue = { number: 141 } as any;
			await manager.writeComment(issue, text);
			await manager.writeComment(issue, text, true);

			expect(gh.paginate).toHaveBeenCalled();
			expect(gh.issues.listComments).toHaveBeenCalledWith(
				expect.objectContaining({
					...repo,
					issue_number: issue.number,
				})
			);

			expect(gh.issues.updateComment).not.toHaveBeenCalled();
			expect(gh.issues.deleteComment).not.toHaveBeenCalled();
			expect(gh.issues.createComment).not.toHaveBeenCalled();
		});
	});
});
