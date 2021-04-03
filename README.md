> **Note:** Dependabot issues and pull requests are no longer supported. See the [changes](#changes) section below for details.

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
      - reopened
  pull_request_target:
    types:
      - opened
      - edited
      - reopened
  schedule:
    - cron: '0 0 * * *' # schedule daily check

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: z0al/dependent-issues@v1
        env:
          # (Required) The token to use to make API calls to GitHub.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          # (Optional) The label to use to mark dependent issues
          label: dependent

          # (Optional) Enable checking for dependencies in issues. Enable by
          # setting the value to "on". Default "off"
          check_issues: off

          # (Optional) A comma-separated list of keywords. Default
          # "depends on, blocked by"
          keywords: depends on, blocked by
```

Here how it can look like in practice:

![example](./demo.png)

## Inputs

- **label** (Optional): The label to use to mark dependent issues. Default `dependent`.
- **check_issues** (Optional): Enable checking for dependencies in issues. Enable by setting the value to `on`. Default `off`.
- **keywords** (Optional): A comma-separated list of keywords. Default `depends on, blocked by`.

## Environment variables

- **GITHUB_TOKEN** (Required): The token to use to make API calls to GitHub.

## Changes

- **March 20, 2021:** To avoid unnecessary failure due to [insufficient permissions][dependabot-change] on Dependabot PRs, all Dependabot issues and pull requests are now ignored. This behavior is not configurable.

## Credits

Special thanks to [Jason Etcovitch](https://github.com/JasonEtco) for the original bot idea.

## License

MIT © [Ahmed T. Ali](https://github.com/z0al)

[dependabot-change]: https://github.blog/changelog/2021-02-19-github-actions-workflows-triggered-by-dependabot-prs-will-run-with-read-only-permissions/
