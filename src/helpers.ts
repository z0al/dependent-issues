// Packages
import { dequal } from 'dequal';
import uniqBy from 'lodash.uniqby';
import issueRegex from 'issue-regex';

// Ours
import {
	Dependency,
	Issue,
	Repository,
	GithubClient,
	ActionContext,
} from './types';

const ISSUE_REGEX = issueRegex();

export function createDependencyRegex(keywords: string[]) {
	const flags = ISSUE_REGEX.flags + 'i';

	// outputs: kw1|kw2 <white-space> (<issue-regex>)
	return new RegExp(
		`(?:${keywords.join('|')})\\s+(${ISSUE_REGEX.source})`,
		flags
	);
}

export function formatDependency(dep: Dependency, repo?: Repository) {
	const depRepo = { owner: dep.owner, repo: dep.repo };

	if (dequal(depRepo, repo)) {
		return `#${dep.number}`;
	}

	return `${dep.owner}/${dep.repo}#${dep.number}`;
}

export class DependencyExtractor {
	private pattern: RegExp;

	constructor(private repo: Repository, keywords: string[]) {
		this.pattern = createDependencyRegex(keywords);
	}

	private deduplicate(deps: Dependency[]) {
		return uniqBy(deps, formatDependency);
	}

	private getIssueLinks(text: string) {
		const issuesWithKeywords = text.match(this.pattern) || [];

		return issuesWithKeywords.map(
			(issue) => issue.match(ISSUE_REGEX)?.[0] as string
		);
	}

	public fromIssue(issue: Issue) {
		const dependencies: Dependency[] = [];

		for (const issueLink of this.getIssueLinks(issue.body || '')) {
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
			await this.gh.issues.get({
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
			await this.gh.issues.addLabels({
				...this.repo,
				issue_number: issue.number,
				labels: [this.config.label],
			});
		}
	}

	async removeLabel(issue: Issue) {
		const shouldRemoveLabel = this.hasLabel(issue);

		if (shouldRemoveLabel) {
			await this.gh.issues.removeLabel({
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
		const isBlocked = dependencies.some((dep) => dep.blocker);

		const header = isBlocked
			? ':hourglass_flowing_sand: Alright! Looks like we ' +
			  'need to wait for some *dependencies*:'
			: ':tada: Great news! Looks like all the *dependencies* ' +
			  'have been resolved:';

		// e.g:
		// * facebook/react#999
		// * ~~facebook/react#1~~
		const dependencyList = deps
			.map((dep) => {
				const link = formatDependency(dep);
				return '* ' + (dep.blocker ? link : `~~${link}~~`);
			})
			.join('\n');

		const dontWorry = isBlocked
			? `Don't worry, I will continue watching the list above and ` +
			  'keep this comment updated. '
			: '';

		const howToUpdate =
			'To add or remove a dependency please update this ' +
			'issue/PR description.';

		const footer =
			`Brought to you by **[${config.actionName}]` +
			`(${config.actionRepoURL})** (:robot: ). Happy coding!`;

		const note = ':bulb: ' + dontWorry + howToUpdate;

		return [header, dependencyList, note, footer].join('\n\n');
	}

	async writeComment(issue: Issue, text: string, create = false) {
		const signedText = this.sign(text);

		const issueComments = await this.gh.paginate(
			this.gh.issues.listComments,
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
			await this.gh.issues.deleteComment({
				...this.repo,
				comment_id: currentComment.id,
			});
		}

		const commentParams = { ...this.repo, body: signedText };

		// Write comment
		currentComment && !create
			? await this.gh.issues.updateComment({
					...commentParams,
					comment_id: currentComment.id,
			  })
			: await this.gh.issues.createComment({
					...commentParams,
					issue_number: issue.number,
			  });
	}

	async removeActionComments(issue: Issue) {
		const issueComments = await this.gh.paginate(
			this.gh.issues.listComments,
			{ ...this.repo, issue_number: issue.number, per_page: 100 }
		);
		const existingComments = issueComments.filter((comment) =>
			this.isSigned(comment.body)
		);

		await Promise.all(
			existingComments.map((comment) =>
				this.gh.issues.deleteComment({
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
			await this.gh.pulls.get({
				...this.repo,
				pull_number: issue.number,
			})
		).data;

		return this.gh.repos.createCommitStatus({
			...this.repo,
			description,
			sha: pull.head.sha,
			context: this.config.actionName,
			state: isBlocked ? 'pending' : 'success',
		});
	}
}
