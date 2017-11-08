// Packages
import uniqBy from 'lodash.uniqby';
import issueRegex from 'issue-regex';

// Ours
import { Dependency, Issue, Repository, GithubClient } from './types';

const ISSUE_REGEX = issueRegex();

export function buildDependencyRegex(keywords: string[]) {
	const flags = ISSUE_REGEX.flags + 'i';

	// outputs: kw1|kw2 <white-space> (<issue-regex>)
	return new RegExp(
		`(?:${keywords.join('|')})\\s+(${ISSUE_REGEX.source})`,
		flags
	);
}

export class DependencyExtractor {
	private pattern: RegExp;

	constructor(private repo: Repository, keywords: string[]) {
		this.pattern = buildDependencyRegex(keywords);
	}

	private deduplicate(deps: Dependency[]) {
		return uniqBy(
			deps,
			(dep) => `${dep.owner}/${dep.repo}#${dep.number}`
		);
	}

	private getIssueLinks(text: string) {
		const issuesWithKeywords = text.match(this.pattern) || [];

		return issuesWithKeywords.map(
			(issue) => issue.match(ISSUE_REGEX)?.[0] as string
		);
	}

	public fromIssue(issue: Issue) {
		const dependencies: Dependency[] = [];

		for (const issueLink of this.getIssueLinks(issue.body)) {
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
				...dep,
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

export class IssueLabeler {
	constructor(
		private gh: GithubClient,
		private repo: Repository,
		private label: string
	) {}

	async add(issue: Issue) {
		const shouldAddLabel = !issue.labels.find(
			(lbl) => lbl.name === this.label
		);

		if (shouldAddLabel) {
			await this.gh.issues.addLabels({
				...this.repo,
				issue_number: issue.number,
				labels: [this.label],
			});
		}
	}

	async remove(issue: Issue) {
		const shouldRemoveLabel = issue.labels.find(
			(lbl) => lbl.name === this.label
		);

		if (shouldRemoveLabel) {
			await this.gh.issues.removeLabel({
				...this.repo,
				issue_number: issue.number,
				name: this.label,
			});
		}
	}
}
