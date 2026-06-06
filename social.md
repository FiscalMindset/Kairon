# LinkedIn Post Draft

While exploring Coral, I wanted to test it with something harder than a clean API.

I had already seen Coral work well when the source has a clear structured interface. So I wanted to check a different case:

Can Coral work directly with a real college attendance website?

I tested this through Kairon, a student attendance assistant.

At first, I thought the main blocker might be CAPTCHA. But after checking the flow, the issue is bigger than just CAPTCHA.

The portal is not exposed like a normal API.

It works through:

- Browser session cookies
- PHP session state
- Frames
- JavaScript form submission
- CAPTCHA image generation
- Authenticated menu links after login
- Portal-specific navigation before attendance data appears

So Coral cannot simply query the website directly and get attendance rows.

Coral can query structured HTTP endpoints and files, but this website first needs a real browser flow to create the authenticated session and reach the data.

That is why I developed a custom Coral source spec called `kairon_live`.

The architecture became:

1. Kairon handles the browser login flow.
2. Student enters the CAPTCHA.
3. Kairon reaches the authenticated attendance data.
4. Flask exposes that cleaned data through `/api/coral/*`.
5. Coral loads the custom `kairon_live` spec.
6. The attendance data becomes queryable with Coral SQL.

Example:

```sql
SELECT subject, semester, attended, absent, total, percentage, status_75
FROM kairon_live.attendance_subjects
WHERE session_id = '<SESSION_ID>'
ORDER BY percentage;
```

Now Coral can query structured data like:

- Student profile
- Attendance summary
- Subject-wise attendance
- Semester-wise totals
- Day-wise attendance rows
- Special attendance marks
- Portal links discovered after login

The learning for me:

The reason Coral cannot directly work with this website is not only CAPTCHA.

CAPTCHA is one part of it, but the deeper reason is that the portal is a browser-driven authenticated application, not a clean queryable data source.

Once Kairon converts that authenticated browser result into local structured endpoints, Coral works well on top of it.

Coral is powerful when you give it a structured source: it turns app data into SQL tables that agents and developers can inspect, query, and reason over.

#Coral #MCP #Kairon #SQL #AIAgents #LocalFirstAI #OpenSource #BuildInPublic #DeveloperTools #WeMakeDevs #Hackathon
