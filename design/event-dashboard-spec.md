Goal:
Create an Event Dashboard that acts as a real-time command center for incident personnel.

Users:
All personnel (IC, Planning, Ops, general staff)

Primary Purpose:
Provide situational awareness and allow quick transition to logging ICS 214 activity.

DO NOT change backend logic.

---

LAYOUT STRUCTURE

1. Command Header (Top)
- Event Name (bold)
- Operational Period (badge)
- User Role (badge)
- Back button

2. Identity Section
- Assigned Role
- Supervisor
- Team Members (if any)

3. Priority Information Strip
- Next Meeting Time (if exists)
- Alerts (if any)
- Must be visually prominent

4. Recent Activity (Operational Period)
- Show latest entries for current OP
- Keep concise (not full log)
- Show timestamps and short descriptions

5. Primary Action
- Large "Log ICS 214 Activity" button
- Must be visually dominant

---

UX REQUIREMENTS

- Mobile-first layout
- Clear visual hierarchy (top = most important)
- No clutter
- Fast scanning under stress
- Dark UI consistent with 214 screen

---

BEHAVIOR

- If only 1 active event → user lands here automatically
- If multiple events → selected event loads this page
- "Log Activity" routes to existing 214 log page

---

DESIGN STYLE

- Match existing 214 dark/orange theme
- Use spacing to separate sections
- Avoid overuse of cards
- Clean, operational feel (not SaaS dashboard clutter)