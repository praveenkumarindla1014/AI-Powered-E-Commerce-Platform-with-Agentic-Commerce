# Pre-Submission Checklist — ShopMind AI

- [ ] App runs locally with no errors (fresh clone + npm install + .env test)
- [ ] Real Razorpay test-mode payment completes successfully at least once
- [ ] AI suggestion returns valid, sensible JSON and displays correctly in UI
- [ ] At least one guardrail-blocked suggestion has been triggered and logged
- [ ] Failure simulation triggers and shows graceful error message
- [ ] /audit page shows all of: suggestion, block, accept, discount, success, failure
- [ ] README complete with setup steps, screenshots, and "How This Meets The Bar" section
- [ ] .env.example included, real .env NOT committed to git
- [ ] Demo video recorded (2-4 min) following DEMO_SCRIPT.md
- [ ] Repo is public (or shared with correct access) before deadline
- [ ] Submission form filled out completely (repo link, video link, team info, pitch text)
- [ ] Deadline and exact submission format double-checked against official hackathon page

## Pitch Paragraph (for submission form)

ShopMind AI is a merchant-side agent that grows revenue through personalized, explainable cross-sell suggestions and makes checkout ready for both human and AI buyers. Every suggestion is generated with visible reasoning, every dollar action is bounded by configurable spend/category rules and gated behind a confirmation step above a threshold, and every decision — accepted, blocked, or failed — is recorded in a live audit trail. We built and tested one full failure scenario (declined payment) to show the agent degrades gracefully instead of breaking. Built on Razorpay test-mode APIs with an OpenAI-powered suggestion engine.

*(Personalize this after seeing your actual demo.)*
