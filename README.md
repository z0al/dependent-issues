# Dependent Issues

> A GitHub Action for marking issues as dependent on another

It works with PRs and issues and supports cross-repository dependencies.

## Usage

Create `.github/workflows/dependent-issues.yml` with the following content:

```yaml
name: Dependent Issues

on:
  issues:
    types:
      - opened
      - edited
      - closed
      - reopened
  pull_request_target:
    types:
      - opened
      - edited
      - closed
      - reopened
      # Makes sure we always add status check for PRs. Useful only if
      # this action is required to pass before merging. Otherwise, it
      # can be removed.
      - synchronize

  # Schedule a daily check. Useful if you reference cross-repository
  # issues or pull requests. Otherwise, it can be removed.
  schedule:
    - cron: '0 0 * * *'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: z0al/dependent-issues@v1
        env:
          # (Required) The token to use to make API calls to GitHub.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # (Optional) The token to use to make API calls to GitHub for remote repos.
          GITHUB_READ_TOKEN: ${{ secrets.GITHUB_READ_TOKEN }}

        with:
          # (Optional) The label to use to mark dependent issues
          label: dependent

          # (Optional) Enable checking for dependencies in issues.
          # Enable by setting the value to "on". Default "off"
          check_issues: off

          # (Optional) A comma-separated list of keywords. Default
          # "depends on, blocked by"
          keywords: depends on, blocked by

          # (Optional) A custom comment body. It supports `{{ dependencies }}` token.
          comment: >
            This PR/issue depends on:

            {{ dependencies }}

            By **[Dependent Issues](https://github.com/z0al/dependent-issues)** (🤖). Happy coding!
```

Here how it can look like in practice:

![example](./demo.png)

## Inputs

- **label** (Optional): The label to use to mark dependent issues. Default `dependent`.
- **check_issues** (Optional): Enable checking for dependencies in issues. Enable by setting the value to `on`. Default `off`.
- **keywords** (Optional): A comma-separated list of keywords. Default `depends on, blocked by`.
- **comment** (Optional): A custom comment body. It supports `{{ dependencies }}` token.

## Environment variables

- **GITHUB_TOKEN** (Required): The token to use to make API calls to GitHub.

## FAQ

Trouble setting up the action? Check the [FAQ](./FAQ.md).

## Credits

Special thanks to [Jason Etcovitch](https://github.com/JasonEtco) for the original bot idea.

## License

MIT © [Ahmed T. Ali](https://github.com/z0al)

[dependabot-change]: https://github.blog/changelog/2021-02-19-github-actions-workflows-triggered-by-dependabot-prs-will-run-with-read-only-permissions/
