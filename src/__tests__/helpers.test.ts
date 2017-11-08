// Packages
import issueRegex from 'issue-regex';

// Ours
import { Issue } from '../types';
import { buildDependencyRegex, DependencyExtractor } from '../helpers';

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
