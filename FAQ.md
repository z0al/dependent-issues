# Frequently Asked Questions (FAQs)

## Using cross-repository dependencies within an organization

1. Setup the action
   
    Setup the action in the repository, where you'd like to create issues and pull requests, that need to use issues or pull requests from another repository within your organization.
   
    Remember to setup
    ```yml
    on:
      schedule:
        - cron: '0 0 * * *'
     ```
    to regulary check the status of referenced issues in other repositories. Adjust the cron-schedule to your personal needs.

2. Create a new PAT
   
    The default setup of dependent-issues uses the pre-configured `GITHUB_TOKEN`, but that only enables access to the repository, in which the action is setup.
    Because of that, you need to create a new PAT (Personal Access Token). Consider using the organization account, to create the PAT.

    Follow the official documentation to create a new PAT:

    [https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)

    When setting up the new PAT, you need to to grant `repo` permissions. Explanations for each permission can be found in the official documentation:

    [https://docs.github.com/en/developers/apps/scopes-for-oauth-apps](https://docs.github.com/en/developers/apps/scopes-for-oauth-apps)

3. Add a new secret in GitHub to access the PAT within the action-workflow

    Follow the instructions under [https://docs.github.com/en/actions/reference/authentication-in-a-workflow#granting-additional-permissions](https://docs.github.com/en/actions/reference/authentication-in-a-workflow#granting-additional-permissions) to add a new secret to the repository.

4. Integrate the secret in the dependent-issue workflow

    Replace the usage of the `GITHUB_TOKEN` with your secret:

    ```yml
    jobs:
      check:
        steps:
          env:
            GITHUB_TOKEN: ${{ secrets.YOUR_NEW_TOKEN }}
    ```

    > Always use the GitHub secret-management to store your PATs! Never put secrets directly in your repository-sourcecode!

5. Reference issues and pull-requests from other organization repositories

    Reference the issue or pull-request with the URL like the following example:

    ```md
    Depends on https://github.com/z0al/dependent-issues/pull/1
    ```
