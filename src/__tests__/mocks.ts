// Ours
import { ActionContext, GithubClient } from '../types';

export let gh: GithubClient;
export let inputs: Partial<ActionContext['config']>;

jest.mock('@actions/core', () => ({
	getInput: jest
		.fn()
		.mockImplementation((key: string) => (inputs as any)[key]),
	debug: jest.fn(),
}));

jest.mock('@actions/github', () => ({
	getOctokit: jest.fn().mockReturnValue(gh),
}));
