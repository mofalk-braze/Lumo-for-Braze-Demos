# Credential Incident Response

Read this file in full before changing history or attempting cleanup. Treat a
credential present in a commit as compromised even if the commit was not
intended to leave the machine.

## 1. Contain

- Stop any push, PR, publish, archive, or teammate handoff.
- Determine whether the affected commit or artifact reached a remote, CI
  system, shared archive, chat, or another machine.
- Do not reproduce the credential in chat, tickets, commit messages, command
  arguments, or diagnostic output.

If the credential is only in an untracked working-tree file, move it to an
approved local destination, verify the path is ignored, and run both scanners.
If it appears in staged content or history, continue below.

## 2. Identify Without Echoing

Identify the credential type, owning system, affected file/blob, and commit
ids. Prefer path-based inspection:

```sh
git log --all --oneline -- <affected-path>
git rev-list --objects --all | grep '<affected-path>'
```

Avoid searching with the secret itself on a command line because shell
history and process inspection can create another disclosure. If content
matching is unavoidable, use the repository scanners and handle their
redacted file/line findings.

## 3. Revoke Or Rotate First

Revoke or rotate in the system that issued the credential:

- Braze dashboard for SDK/REST credentials;
- Google Cloud/Firebase administration for service accounts;
- Apple developer tooling for APNs/signing material;
- signing-key owner for keystores.

Also revoke credentials or tokens that the leaked material could mint. Verify
that the old value no longer authorizes access. Cleanup before rotation leaves
an active credential in clones, reflogs, CI caches, and forge storage.

## 4. Coordinate History Cleanup

For unpushed local history, amend or rewrite only the affected local commits,
then verify the repository. Do not use destructive commands against broad
paths or unrelated user changes.

For history already shared or pushed, stop and notify the repository owner
with affected path/blob/commit ids and exposure scope. History rewriting and
force-pushing a shared repository require an owner-coordinated window. Do not
perform them unilaterally.

## 5. Verify Recovery

After rotation and approved cleanup:

```sh
npm run security:scan
npm run public:check
git status --short --ignored
```

Confirm all of the following:

- old credentials are revoked;
- replacement credentials work only from approved local destinations;
- scanners pass;
- sensitive local paths show as ignored;
- shared clones/caches have followed the owner's remediation instructions;
- no incident material was reintroduced into documentation or skills.

## Service-Account Handoff

For planned teammate push setup, use a password manager or another audited
secret handoff. Share only with the small setup group and only for the period
needed. The teammate uploads the service account into their own Braze
workspace; it does not enter the repo or app. Rotate/delete any short-lived
setup credential after the setup/event and remove downloaded copies from the
repository tree.
