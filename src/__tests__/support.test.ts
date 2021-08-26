import { isSupported } from '../support';

describe('isSupported', () => {
	it('should not fail when given incomplete issue data', () => {
		const config: any = {
			ignore_dependabot: 'off',
		};
		const issue: any = {
			user: null,
		};

		expect(isSupported(config, issue)).toEqual(true);
	});

	it('should return false for ignored Dependabot issues or pull requests', () => {
		const config: any = {
			ignore_dependabot: 'on',
		};
		const issue: any = {
			user: {
				login: 'dependabot[bot]',
			},
		};

		expect(isSupported(config, issue)).toEqual(false);
	});

	it('should return true for non-ignored Dependabot issues or pull requests', () => {
		const config: any = {
			ignore_dependabot: 'off',
		};
		const issue: any = {
			user: {
				login: 'dependabot[bot]',
			},
		};

		expect(isSupported(config, issue)).toEqual(true);
	});
});
