Test Suite Summary
Suite: FlacronCV - Validating Selecting Cover Letter cart
Platform: Web UI tests for MY Cover Letter page
Status: All tests executed with all passing; one test fault noted below
Summary of test cases:

TC-01: Create Cover Letter with AI Generate button and validate data on My CoverLetter Page — Passed 
TC-02: Validate data on My Cover Letter page with Create Blank button and AI Improve button — Passed 
TC-03: Validate data on My Cover Letter Page with Create Blank button and without AI Improve button — Passed
TC-04: Validate data on Cover Letter Edit page created with Generate with AI button — Passed 
TC-05: Validate data on Cover Letter Edit page created with Create Blank button with AI Improve button — Passed 
TC-06: Validate data on Cover Letter Edit page created with Create Blank button without AI Improve button — Passed
TC-07: Validate Duplicate button for creating cover letter with AI Generate button — Passed 
TC-08: Validate Duplicate button for creating cover letter with Create Blank cover letter then AI Improve — Passed 
TC-09: Validate Duplicate button for creating cover letter with Create Blank cover letter — Passed 
TC-10: Validate Delete button for Created CoverLetter — Passed 
TC-11: Cancel button on Validate Delete button — Passed
Notes:


Install dependencies

npm ci
▶✏
Run the cover letter test suite

npm run test:cover-letter
▶✏
Generate a readable report 
npm run test:report

