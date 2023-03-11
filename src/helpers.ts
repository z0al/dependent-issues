// Packages
import { dequal } from 'dequal';
import uniqBy from 'lodash.uniqby';
import IssueRegex from 'issue-regex';

// Ours
import {
	Dependency,
	Issue,
	Repository,
	GithubClient,
	ActionContext,
	Comment,
	StatusCheck,
	isValidStatusCheck,
} from './types';

export function formatDependency(dep: Dependency, repo?: Repository) {
	const depRepo = { owner: dep.owner, repo: dep.repo };

	if (dequal(depRepo, repo)) {
		return `#${dep.number}`;
	}

	return `${dep.owner}/${dep.repo}#${dep.number}`;
}

export function sanitizeStatusCheckInput(statusCheckInput: string) {
	const statusCheck = isValidStatusCheck(statusCheckInput)
		? statusCheckInput
		: 'pending';

	return statusCheck as StatusCheck;
}

export class DependencyExtractor {
	private regex: RegExp;
	private issueRegex = IssueRegex();
	private urlRegex =
		/https?:\/\/github\.com\/(?:\w[\w-.]+\/\w[\w-.]+|\B)\/(?:issues|pull)\/[1-9]\d*\b/;
	private keywordRegex: RegExp;

	constructor(private repo: Repository, keywords: string[]) {
		this.keywordRegex = new RegExp(
			keywords.map((kw) => kw.trim().replace(/\s+/g, '\\s+')).join('|'),
			'i'
		);

		this.regex = this.buildRegex();
	}

	private buildRegex() {
		const flags = this.issueRegex.flags + 'i';
		const ref = `${this.issueRegex.source}|${this.urlRegex.source}`;

		return new RegExp(
			`(?:${this.keywordRegex.source})\\s+(${ref})`,
			flags
		);
	}

	private deduplicate(deps: Dependency[]) {
		return uniqBy(deps, formatDependency);
	}

	private match(text: string) {
		const references = text.match(this.regex) || [];

		return references.map((ref) => {
			// Get rid of keywords now
			ref = ref.replace(this.keywordRegex, '').trim();

			// Remove full URL if found. Should return either '#number' or
			// 'owner/repo#number' format
			return ref
				.replace(/https?:\/\/github\.com\//i, '')
				.replace(/\/(issues|pull)\//i, '#');
		});
	}

	public fromIssue(issue: Issue) {
		const dependencies: Dependency[] = [];

		for (const issueLink of this.match(issue.body || '')) {
			// Can be '#number' or 'owner/repo#number'
			// 1) #number
			if (issueLink.startsWith('#')) {
				const issueNumber = Number(issueLink.slice(1));

				// Prevent self-referencing
				if (issueNumber !== issue.number) {
					dependencies.push({
						...this.repo,
						number: issueNumber,
					});
				}

				continue;
			}

			// 2) owner/repo#number
			const [owner, rest] = issueLink.split('/');
			const [repoName, issueNumber] = rest.split('#');

			dependencies.push({
				owner,
				repo: repoName,
				number: Number(issueNumber),
			});
		}

		return this.deduplicate(dependencies);
	}
}

export class DependencyResolver {
	private cache: Map<string, { issue: Issue; repo: Repository }>;

	constructor(
		private gh: GithubClient,
		issues: Issue[],
		repo: Repository
	) {
		this.cache = new Map();

		// Populate the cache with the known issues
		issues.forEach((issue) => {
			this.cache.set(
				this.cacheKey({
					...repo,
					number: issue.number,
				}),
				{ issue, repo }
			);
		});
	}

	private cacheKey(dep: Dependency) {
		return `${dep.owner}/${dep.repo}#${dep.number}`;
	}

	async get(dep: Dependency) {
		const key = this.cacheKey(dep);
		const cachedIssue = this.cache.get(key)?.issue;

		if (cachedIssue) {
			return cachedIssue;
		}

		// Fetch from GitHub
		const remoteIssue = (
			await this.gh.rest.issues.get({
				owner: dep.owner,
				repo: dep.repo,
				issue_number: dep.number,
			})
		).data;

		this.cache.set(key, {
			issue: remoteIssue,
			repo: {
				owner: dep.owner,
				repo: dep.repo,
			},
		});

		return remoteIssue;
	}
}

export class IssueManager {
	constructor(
		private gh: GithubClient,
		private repo: Repository,
		private config: ActionContext['config']
	) {}

	hasLabel(issue: Issue) {
		const labels = issue.labels.map((label) =>
			typeof label === 'string' ? label : label.name
		);

		return labels.includes(this.config.label);
	}

	async addLabel(issue: Issue) {
		const shouldAddLabel = !this.hasLabel(issue);

		if (shouldAddLabel) {
			await this.gh.rest.issues.addLabels({
				...this.repo,
				issue_number: issue.number,
				labels: [this.config.label],
			});
		}
	}

	async removeLabel(issue: Issue) {
		const shouldRemoveLabel = this.hasLabel(issue);

		if (shouldRemoveLabel) {
			await this.gh.rest.issues.removeLabel({
				...this.repo,
				issue_number: issue.number,
				name: this.config.label,
			});
		}
	}

	/**
	 * Adds a unique text at the end of the text to distinguish the
	 * action own's comments.
	 */
	private sign(text: string) {
		return text.trim() + '\n' + this.config.commentSignature;
	}

	private isSigned(text?: string) {
		if (!text) {
			return false;
		}

		return text.trim().endsWith(this.config.commentSignature);
	}

	private originalText(signed?: string) {
		if (!signed) {
			return '';
		}

		return signed
			.trim()
			.slice(0, -1 * this.config.commentSignature.length)
			.trim();
	}

	public generateComment(
		deps: Dependency[],
		dependencies: Dependency[],
		config: ActionContext['config']
	) {
		// e.g:
		// * facebook/react#999
		// * ~~facebook/react#1~~
		const dependenciesList = deps
			.map((dep) => {
				const link = formatDependency(dep);
				return '* ' + (dep.blocker ? link : `~~${link}~~`);
			})
			.join('\n');

		//
		return config.commentBody.replace(
			/\{\{\s*dependencies\s*\}\}/gi,
			dependenciesList
		);
	}

	async writeComment(issue: Issue, text: string, create = false) {
		const signedText = this.sign(text);

		const issueComments: Comment[] = await this.gh.paginate(
			this.gh.rest.issues.listComments as any,
			{ ...this.repo, issue_number: issue.number, per_page: 100 }
		);

		const currentComment = issueComments.find((comment) =>
			this.isSigned(comment.body)
		);

		// Exit early if the content is the same
		if (currentComment) {
			const newContent = text.trim();
			const existingContent = this.originalText(currentComment.body);

			if (existingContent === newContent) {
				return;
			}
		}

		// Delete old comment if necessary
		if (create && currentComment) {
			await this.gh.rest.issues.deleteComment({
				...this.repo,
				comment_id: currentComment.id,
			});
		}

		const commentParams = { ...this.repo, body: signedText };

		// Write comment
		currentComment && !create
			? await this.gh.rest.issues.updateComment({
					...commentParams,
					comment_id: currentComment.id,
			  })
			: await this.gh.rest.issues.createComment({
					...commentParams,
					issue_number: issue.number,
			  });
	}

	async removeActionComments(issue: Issue) {
		const issueComments: Comment[] = await this.gh.paginate(
			this.gh.rest.issues.listComments as any,
			{ ...this.repo, issue_number: issue.number, per_page: 100 }
		);
		const existingComments = issueComments.filter((comment) =>
			this.isSigned(comment.body)
		);

		await Promise.all(
			existingComments.map((comment: any) =>
				this.gh.rest.issues.deleteComment({
					...this.repo,
					comment_id: comment.id,
				})
			)
		);
	}

	async updateCommitStatus(issue: Issue, dependencies: Dependency[]) {
		if (!issue.pull_request) {
			return;
		}

		const blockers = dependencies.filter((dep) => dep.blocker);
		const isBlocked = blockers.length > 0;
		const firstDependency = isBlocked
			? formatDependency(blockers[0], this.repo)
			: '';

		const description = !isBlocked
			? dependencies.length === 0
				? 'No dependencies'
				: 'All dependencies are resolved'
			: blockers.length == 1
			? `Blocked by ${firstDependency}`
			: `Blocked by ${firstDependency} and ${
					blockers.length - 1
			  } more issues`;

		// Get the PR Head SHA
		const pull = (
			await this.gh.rest.pulls.get({
				...this.repo,
				pull_number: issue.number,
			})
		).data;

		return this.gh.rest.repos.createCommitStatus({
			...this.repo,
			description,
			sha: pull.head.sha,
			context: this.config.actionName,
			state: isBlocked ? this.config.status_check_type : 'success',
		});
	}
}
