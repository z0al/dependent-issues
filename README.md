# Dependent Issues

> A GitHub Action for marking issues as dependent on another

## Usage

Create `.github/workflows/dependent-issues.yml` with the following content:

```yaml
name: Dependent Issues

on:
  issues:
  pull_request:
  schedule:
    - cron: '0 0 * * *' # daily

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: z0al/dependent-issues@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Here how it can look like in practice:

![example](./demo.png)

## Inputs

- **label** (Optional): The label to use to mark dependent issues. Default `dependent`.
- **check_issues** (Optional): Enable checking for dependencies in issues. Enable by setting the value to `on`. Default `off`.
- **keywords** (Optional): A comma-separated list of keywords. Default `depends on, blocked by`.

## Environment variables

- **GITHUB_TOKEN** (Required): A token to use for making API calls to GitHub.

## Credits

Special thanks to [Jason Etcovitch](https://github.com/JasonEtco) for the original bot idea.

## License

MIT © [Ahmed T. Ali](https://github.com/z0al)
