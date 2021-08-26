import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';

// https://stackoverflow.com/questions/48011353/how-to-unwrap-type-of-a-promise
type UnwrapPromise<T> = T extends PromiseLike<infer U> ? U : T;

export type GithubClient = Octokit;

export type Issue = UnwrapPromise<
	ReturnType<GithubClient['rest']['issues']['get']>
>['data'];

export type Comment = UnwrapPromise<
	ReturnType<GithubClient['rest']['issues']['getComment']>
>['data'];

export type Dependency = Required<typeof github.context.issue> & {
	blocker?: boolean;
};
export type Repository = Required<typeof github.context.repo>;

export type ActionContext = {
	client: GithubClient;
	readOnlyClient: GithubClient;
	issues: Issue[];
	repo: Repository;
	config: {
		actionName: string;
		commentSignature: string;
		actionRepoURL: string;
		label: string;
		check_issues: string;
		ignore_dependabot: string;
		keywords: string[];
	};
};
