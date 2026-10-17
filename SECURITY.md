# Security policy

## Reporting a vulnerability

Do not open a public issue for a security problem. Use the "Report a vulnerability" button under the Security tab of the GitHub repository. That creates a private advisory that only the maintainers can read.

Include what you found, how to reproduce it, and which version or commit you tested. You get a first reply within seven days.

## Supported versions

Only the latest tagged release receives security fixes.

## Scope

Smart Parks Protect Go runs on one person's computer. The maintainers fix problems in this codebase. Problems in the decoding it shares with Protect go to Protect's security policy; problems in the firmware of the stations and trackers go to the firmware's repository.

## Secrets

The program holds a tracker's LP0 session keys while a bundle is loaded; they live in the data folder, encrypted with a key the user gives, and never in a log, a screenshot or an upload. Never commit credentials. `.env` files, private keys and the data folder are ignored by git and refused by the pre-commit hook. If you commit a secret by accident, rotate it first and then tell the maintainers; removing it from history is not enough.
