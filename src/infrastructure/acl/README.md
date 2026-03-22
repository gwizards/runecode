# Anti-Corruption Layers

ACL classes translate domain events between bounded contexts.
They subscribe to one context's event bus and emit into another context's
vocabulary, preventing domain concepts from leaking across boundaries.

## Session -> Analytics ACL
`session-analytics-acl.ts` -- Translates SessionCompleted and SessionFailed
events into analytics capture calls. Subscribe during app bootstrap.

## Rules
- ACLs live in src/infrastructure/, not in src/domain/
- ACLs may import event interfaces from domain contexts but never aggregates
- ACLs own the translation mapping -- neither source nor target context knows about the ACL
