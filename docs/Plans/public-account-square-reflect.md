# Reflect — Public Account Square

What failed / nearly failed:
- The first reset test used an overly broad `user_profile` regular expression and mistakenly matched the new `user_profile_visits` table. The assertion was narrowed and the complete suite then passed.
- Public viewer revocation initially existed only at connection time. Existing viewer sockets could otherwise remain subscribed after an owner changed visibility, so the Durable Object gained an explicit viewer-revocation path.
- The first rolling-deploy shape required new viewer headers immediately. A compatibility rule now treats headerless legacy Pages traffic as owner-only edit traffic, allowing the realtime worker to be deployed safely before the new gateway.
- The local browser session did not have an authenticated test account, so the new signed-in workspace could not receive a final visual smoke screenshot without bypassing the real authentication boundary.

Three concrete improvements next time:
1. Add a repository-owned authenticated UI fixture with synthetic accounts, public/private projects and trace rows so desktop/mobile snapshots do not depend on a personal session.
2. Add behavioral Durable Object tests that open edit/view sockets, change publication state and assert the viewer receives close code `4003` while the owner remains connected.
3. Aggregate trace presence by viewer and project for display while retaining raw per-session audit rows, so multiple devices from one viewer do not create duplicate “正在看我” entries.

Lessons appended to context memory:
- Visibility is a live capability, not only a request-time filter; narrowing it must invalidate already-issued realtime access.
- Rollout compatibility belongs in the protocol design before deployment ordering is documented.
- Account-level data deletion must cover both sides of relational audit data: inbound rows where the account is owner and outbound rows where it is viewer.

