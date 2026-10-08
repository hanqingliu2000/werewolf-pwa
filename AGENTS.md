# Repository Collaboration

- After implementing a requested feature and passing the relevant verification, commit the scoped changes and push them to the existing GitHub remote. The user has authorized this as the default workflow.
- Keep unrelated user changes intact. Do not commit credentials, environment files, session data, test databases, private logs, model caches, or local backups.
- A Git push is not authorization to promote a production deployment. Follow the deployment acceptance gates and keep preview data isolated from production.
- Keep the old website, old cloud project, and archived private backups unchanged during the web-v2 deployment.
- Report the commit, push result, verification performed, and anything that remains unverified. Do not claim that a partial browser test is a complete game or real-phone acceptance.
