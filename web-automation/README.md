# FlacronCV
AI-powered resume and cover letter builder designed to help job seekers create ATS-optimized CVs, apply faster, and stand out globally.

📘 FlacronCV – Landing Page Automation (Cypress)

This project contains an enterprise-level Cypress automation framework for validating the FlacronCV Landing Page UI,Functionality and responsiveness.

It ensures that the landing page works correctly across all screen resolutions and that key UI elements are properly aligned and functional.

📁 Folder Structure
FLACRONCV/└── web-automation/

│
├── cypress/
│   │
│   │   
│   ├── e2e/
│   │   └── tests/
│   │        └── landingPage.cy.js
│   │
│   ├── fixtures/
│   │
│   ├── pages/
│   │   ├── authPage.js
│   │   ├── footer.js
│   │   ├── landingPage.js
│   │   └── topMenu.js
│   │
│   ├── reports/
│   │
│   ├── screenshots/
│   │
│   ├── support/
│   │   ├── commands.js
│   │   ├── e2e.js
│   │   └── randomSelectDropdownMenu.js
│   │
│   └── videos/
│
├── node_modules/
│


🧪 What is Tested

The automation covers the critical UI and functional areas of the landing page:

✔ Responsive layout on mobile, tablet, laptop, desktop

✔ Text, images, and buttons are center-aligned

✔ “Get Started Free” buttons are visible and clickable

✔ Top navigation menu is displayed correctly

✔ Footer links are present and accessible

✔ Detects layout overlap and horizontal scrolling issues

✔ Captures screenshots and videos for every test run

▶ How to Run Tests Locally

Install dependencies:
npm install

Open Cypress UI:
npx cypress open

Run tests headlessly:
npx cypress run

⚙ Run Tests from GitHub Actions (YML)

Your pipeline is located at:
.github/workflows/cypress.

To trigger it:

Push code to GitHub

Go to GitHub → Actions

Select Cypress Workflow

Click Run Workflow

This will execute tests automatically on the cloud environment.
☁ Re-Run Tests from Cypress Cloud

Login to Cypress Cloud

Open your project

Select the failed test run

Click Re-Run Job
This will execute the same tests again and generate new reports.

📊 View HTML Report (Screenshots + Videos)

After test execution:

Open the HTML report:
reports/html-report/index.html

The report contains:

📸 Screenshots of failures

🎥 Recorded videos of test execution

🧪 Pass / Fail summary

📝 Detailed test steps




