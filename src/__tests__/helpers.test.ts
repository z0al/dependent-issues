// Ours
import { ActionContext, GithubClient, Issue } from '../types';
import {
	DependencyExtractor,
	DependencyResolver,
	IssueManager,
	formatDependency,
} from '../helpers';

test('formatDependency', () => {
	const repo = { owner: 'owner', repo: 'repo' };
	const dep = { ...repo, number: 141 };

	expect(formatDependency(dep)).toEqual('owner/repo#141');
	expect(formatDependency(dep, repo)).toEqual('#141');
});

test('DependencyExtractor', () => {
	const repo = {
		owner: 'github',
		repo: 'atom',
	};

	const body = `
	Should match:

	- Plain issue:
		- Depends on #666
		- Blocked by #123
	- From another repository:
		- Depends on another/repo#123
	- Full issue URL:
		- Depends on https://github.com/another/repo/issues/141
		- Depends on http://github.com/another/repo/issues/404
		- Depends on https://github.com/another/repo/pull/142
	- Crazy formatting:
		- Depends on ano-ther.999/re_po#123
	- In brackets:
		- (Depends on #486)
		- [Depends on #3167]
		- <Depends on another/repo#18767>

	Should NOT match:

	- Depends on #0
	- Depends on another/repo#0
	- Depends on nonrepo#123
	- Depends on non/-repo#123
	- Depends on user_repo#123
	- Depends on this/is/not/repo#123
	- Depends on #123hashtag
	- Depends on https://github.com/another/repo/pulls/142
	`;

	const issue = { body } as Issue;

	const expectedDeps = [
		// Depends on #666
		{
			...repo,
			number: 666,
		},
		// Blocked by #123
		{
			...repo,
			number: 123,
		},
		// Depends on another/repo#123
		{
			owner: 'another',
			repo: 'repo',
			number: 123,
		},
		// Depends on https://github.com/another/repo/issues/141
		{
			owner: 'another',
			repo: 'repo',
			number: 141,
		},
		// Depends on http://github.com/another/repo/issues/404
		{
			owner: 'another',
			repo: 'repo',
			number: 404,
		},
		// Depends on https://github.com/another/repo/pull/142
		{
			owner: 'another',
			repo: 'repo',
			number: 142,
		},
		// Depends on ano-ther.999/re_po#123
		{
			owner: 'ano-ther.999',
			repo: 're_po',
			number: 123,
		},
		// (Depends on #486)
		{
			...repo,
			number: 486,
		},
		// [Depends on #3167]
		{
			...repo,
			number: 3167,
		},
		// <Depends on another/repo#18767>
		{
			owner: 'another',
			repo: 'repo',
			number: 18767,
		},
	];

	const extractor = new DependencyExtractor(repo, [
		'  depends On',
		'blocked   by',
	]);

	expect(extractor.fromIssue(issue)).toEqual(expectedDeps);
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
			rest: {
				issues: {
					get: issuesGet as any,
				},
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
			rest: {
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
			((gh.rest.pulls.get as unknown) as jest.Mock<
				any,
				any
			>).mockResolvedValue({ data: pr });
		});

		it('ignores non-PRs', async () => {
			const issue = {} as any;
			await manager.updateCommitStatus(issue, []);
			expect(gh.rest.pulls.get).not.toHaveBeenCalled();
			expect(gh.rest.repos.createCommitStatus).not.toHaveBeenCalled();
		});

		it('sets the correct status on success', async () => {
			const issue = { number: 141, pull_request: {} } as any;

			await manager.updateCommitStatus(issue, []);

			expect(gh.rest.pulls.get).toHaveBeenCalledWith({
				...repo,
				pull_number: issue.number,
			});

			expect(gh.rest.repos.createCommitStatus).toHaveBeenCalledWith({
				...repo,
				description: 'No dependencies',
				state: 'success',
				sha: pr.head.sha,
				context: config.actionName,
			});
		});

		it('sets the correct status on failure', async () => {
			const issue = { number: 141, pull_request: {} } as any;

			await manager.updateCommitStatus(issue, [
				{ repo: 'repo', owner: 'owner', number: 999, blocker: true },
				{ blocker: true } as any,
				{ blocker: true } as any,
			]);

			expect(gh.rest.pulls.get).toHaveBeenCalledWith({
				...repo,
				pull_number: issue.number,
			});

			expect(gh.rest.repos.createCommitStatus).toHaveBeenCalledWith({
				...repo,
				description: 'Blocked by owner/repo#999 and 2 more issues',
				state: 'failure',
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

			expect(gh.rest.issues.listComments).toHaveBeenCalledWith(
				expect.objectContaining({
					...repo,
					issue_number: issue.number,
				})
			);

			expect(gh.rest.issues.updateComment).toHaveBeenCalledWith({
				...repo,
				body: text.trim() + '\n' + config.commentSignature,
				comment_id: 2,
			});

			expect(gh.rest.issues.deleteComment).not.toHaveBeenCalled();
			expect(gh.rest.issues.createComment).not.toHaveBeenCalled();
		});

		it('creates a new comment if required', async () => {
			const text = ' This is the updated text\n';
			const issue = { number: 141 } as any;
			await manager.writeComment(issue, text, true);

			expect(gh.paginate).toHaveBeenCalled();

			expect(gh.rest.issues.listComments).toHaveBeenCalledWith({
				...repo,
				issue_number: issue.number,
				per_page: 100,
			});

			expect(gh.rest.issues.deleteComment).toHaveBeenCalledWith({
				...repo,
				comment_id: 2,
			});

			expect(gh.rest.issues.createComment).toHaveBeenCalledWith({
				...repo,
				issue_number: issue.number,
				body: text.trim() + '\n' + config.commentSignature,
			});

			expect(gh.rest.issues.updateComment).not.toHaveBeenCalled();
		});

		it('exits early if the text is the same', async () => {
			const text = 'Existing text';
			const issue = { number: 141 } as any;
			await manager.writeComment(issue, text);
			await manager.writeComment(issue, text, true);

			expect(gh.paginate).toHaveBeenCalled();
			expect(gh.rest.issues.listComments).toHaveBeenCalledWith(
				expect.objectContaining({
					...repo,
					issue_number: issue.number,
				})
			);

			expect(gh.rest.issues.updateComment).not.toHaveBeenCalled();
			expect(gh.rest.issues.deleteComment).not.toHaveBeenCalled();
			expect(gh.rest.issues.createComment).not.toHaveBeenCalled();
		});
	});
});
