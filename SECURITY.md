# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting
("Security" tab → "Report a vulnerability") on this repository. Include steps to reproduce and the affected version.
You can expect an acknowledgement within a week. This is a small, non-commercial project maintained in spare time.

## Scope

Of particular interest:

- anything that lets the server, an operator or another user read diary content (the app is end-to-end encrypted);
- authentication bypass, session theft, CSRF, XSS or CSP bypass;
- metadata leaks beyond those documented in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

The threat model lists known, accepted limits (for example, a server that serves modified JavaScript can capture a passphrase).
Reports that restate a documented limit are welcome as discussion, but are not treated as vulnerabilities.

## Supported versions

Only the latest release receives fixes. Please update (see [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md)) before reporting,
and say which version you run.
