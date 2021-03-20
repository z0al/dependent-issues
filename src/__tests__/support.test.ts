import { isSupported } from '../support';

describe('isSupported', () => {
	it('should not fail when given incomplete issue data', () => {
		const issue: any = {
			user: null,
		};

		expect(isSupported(issue)).toEqual(true);
	});

	it('should return false for Dependabot issues or pull requests', () => {
		const issue: any = {
			user: {
				login: 'dependabot[bot]',
			},
		};

		expect(isSupported(issue)).toEqual(false);
	});
});
