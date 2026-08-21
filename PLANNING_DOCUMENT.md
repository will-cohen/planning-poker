# Planning Document: Remote Planning Poker Web App

## 1. Vision
Build a web application that enables distributed software teams to run planning poker sessions remotely, estimate backlog items quickly, and reach consensus with less meeting friction.

## 2. Problem Statement
Remote teams often estimate work in fragmented tools (video call + ticket tracker + chat), creating process overhead and weak session records. The app should provide a focused, real-time experience for running estimation sessions end-to-end.

## 3. Product Goals
- Run fast, reliable planning poker sessions for remote teams.
- Support anonymous voting to reduce anchoring bias.
- Reveal votes simultaneously and facilitate discussion.
- Enable local-first collaboration with CRDTs and no custom backend.
- Provide in-browser session persistence and exportability.

## 4. Success Metrics
- Session setup time under 60 seconds.
- 95%+ vote reveal completion rate per round.
- Median estimate convergence in 2 rounds or fewer.
- Less than 2% session drop due to technical issues.
- Weekly active teams and session retention growth.

## 5. Primary Users
- Scrum Master / Facilitator: creates and manages sessions.
- Team Member / Voter: joins session, votes, discusses, revotes.
- Observer: read-only attendee who can follow session progress but cannot vote.

## 6. Scope
### In Scope (MVP)
- User identity via display name only (no account required).
- Create/join room with shareable link.
- Add backlog items manually during session.
- Card deck voting (Fibonacci + special cards: ?, coffee, break).
- Anonymous vote collection.
- Reveal button for facilitator to show round results simultaneously.
- Round reset and revote.
- Final estimate capture per item.
- Observer-only join role.
- Session log and client-side export (CSV/JSON).

### Out of Scope (MVP)
- Native mobile apps.
- Advanced analytics dashboards.
- Full enterprise SSO.
- Custom backend services and databases.
- Deep ticketing integrations (Jira, Azure DevOps) in v1.

## 7. Functional Requirements
1. Room Management
- Create room with room name and facilitator role.
- Generate invite link.
- Join room from browser with nickname and role selection (voter or observer).
- Show participant list and online status.

2. Backlog Item Management
- Add, edit, reorder, and remove items.
- Set active item for voting.
- Mark item as estimated with final value.

3. Voting Workflow
- Each participant selects one card per round.
- Vote remains hidden until reveal.
- Facilitator uses a reveal button to reveal all votes at once.
- Display vote distribution and identify spread.
- Facilitator can reset round and trigger revote.

4. Observer Role
- Observers can join any active room via invite link.
- Observers can see active item, participant list, and revealed results.
- Observers cannot cast votes, reveal votes, or finalize estimates.

5. Moderation Controls
- Facilitator can mute voting (pause), remove inactive user, and end session.
- Optional timer per round.

6. Session Persistence
- Persist room state to recover from refresh.
- Keep historical rounds and final estimate history.
- Export session summary from the browser.

## 8. Non-Functional Requirements
- Real-time responsiveness: update latency target under 250 ms.
- Availability target: 99.5% for initial release.
- Security: HTTPS only, unguessable room IDs, optional room passphrase, basic abuse protection.
- Privacy: minimal PII storage.
- Accessibility: keyboard-friendly controls, clear contrast, ARIA labels.
- Performance: support 50 concurrent participants per room for MVP.

## 9. Proposed Tech Stack
- Frontend: React + TypeScript + Vite.
- Styling: Tailwind CSS (or CSS modules if preferred).
- Shared state: Yjs CRDT documents.
- Realtime sync: y-webrtc provider (peer-to-peer sync).
- Ephemeral awareness/presence: Yjs Awareness API.
- Persistence: IndexedDB (client-side) for offline/session restore.
- Hosting: Netlify free tier (frontend only).
- Auth: guest mode with nickname and role selection.

## 10. High-Level Architecture
- Client app renders room state and applies local CRDT updates.
- Yjs document is the source of truth for room, items, rounds, votes, and reveal state.
- Peers synchronize state directly using WebRTC through y-webrtc.
- Browser IndexedDB stores local snapshots for reconnect and refresh recovery.

## 11. Data Model (Initial)
CRDT Document Maps/Collections
- roomMeta (Y.Map): roomId, roomName, facilitatorId, status, createdAt.
- participants (Y.Map): participantId -> nickname, role (facilitator|voter|observer), online.
- backlogItems (Y.Array): ordered items with finalEstimate and status.
- rounds (Y.Array): per-item voting rounds, reveal state, timestamps.
- votes (Y.Map): roundId + participantId -> value.
- uiState (Y.Map): activeItemId, timerState, revealTriggeredBy.

## 12. CRDT Sync and Client Actions (Draft)
No REST or custom websocket API is required for MVP.

Client Actions
- createRoom
- joinRoom
- setRole (voter|observer)
- addItem / editItem / reorderItem / removeItem
- setActiveItem
- submitVote (voter only)
- revealVotes (facilitator reveal button)
- resetRound
- finalizeEstimate
- exportSession

Derived UI Events
- participantJoined
- participantRoleChanged
- voteSubmitted
- revealTriggered
- roundReset
- estimateFinalized

## 13. UX Flow
1. Facilitator creates room.
2. Team joins via link as voter or observer.
3. Facilitator adds/imports backlog items.
4. Select active item.
5. Voters vote privately.
6. Facilitator clicks Reveal to show results.
7. Team discusses spread.
8. Revote if needed.
9. Final estimate saved.
10. Move to next item and repeat.

## 14. Delivery Plan
### Phase 0: Discovery (2-3 days)
- Validate user stories and acceptance criteria.
- Confirm estimation card sets and session rules.
- Confirm CRDT schema and conflict-resolution rules.

### Phase 1: MVP Core (2-3 weeks)
- Room creation/joining.
- Real-time participant presence via Yjs Awareness.
- Item management.
- Hidden voting + reveal button + reset.
- Observer role restrictions.

### Phase 2: Hardening (1-2 weeks)
- IndexedDB persistence and session restore.
- Client-side export summary.
- Accessibility pass.
- Basic analytics and error tracking.
- Load/performance tuning.

### Phase 3: Integrations (Post-MVP)
- Optional managed signaling fallback strategy.
- Jira/Azure DevOps import/export.
- Team-level settings and templates.

## 15. Milestones and Acceptance Criteria
### Milestone A: Real-Time Room Running
- Users can create/join room and see live participant updates using CRDT sync.

### Milestone B: Estimation Round Complete
- Hidden votes, facilitator reveal button, and revote loop work without data loss.

### Milestone C: Session Completion
- Final estimates are synchronized and export works from the browser.

### Milestone D: Production Readiness
- Netlify free-tier deployment, monitoring, and security controls validated.

## 16. Risks and Mitigations
- Risk: Realtime sync inconsistencies.
  - Mitigation: CRDT-based conflict-free merges, reconnect strategy, deterministic reveal flag updates.
- Risk: Participant drop-offs due to UX friction.
  - Mitigation: simple join flow, no forced signup for guests.
- Risk: Scope creep before MVP.
  - Mitigation: strict MVP boundary and change control.
- Risk: WebRTC connectivity limitations in some networks.
  - Mitigation: test across network conditions and provide managed signaling fallback if needed.

## 17. Testing Strategy
- Unit tests for vote lifecycle, role permissions, and reveal state transitions.
- Integration tests for CRDT state merges and presence updates.
- End-to-end tests for full session flow (create room -> vote -> reveal -> finalize).
- Load tests for 50 concurrent users/room.
- Accessibility checks with keyboard and screen reader basics.

## 18. Security and Compliance Basics
- Enforce HTTPS and use unguessable room IDs (plus optional room passphrase).
- Validate and sanitize all inputs on the client.
- Apply room access controls and role checks in client actions.
- Audit log for moderator actions.
- Minimal retention policy for guest identifiers.

## 19. Open Questions
- Which vote card sets are mandatory at launch?
  - Fibonaci
- Is anonymous-by-default voting acceptable for all teams?
  - Yes
- What export format is highest priority (CSV vs JSON vs both)?
  - CSV
- Is managed signaling fallback required before first pilot?
  - No

## 20. Definition of Done (MVP)
- Teams can complete a full planning poker session remotely.
- Vote rounds are stable, accurate, and CRDT-synchronized.
- Facilitator can finalize estimates and export session summary.
- Observers can join in read-only mode and view revealed results.
- Core flows pass functional, accessibility, and reliability checks.
