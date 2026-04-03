Login & Signup Automation – Cypress

This branch contains automation tests for Login and Signup functionality of the FlacronCV application:

Application URL:
https://flacroncv.onrender.com/

The tests are written using Cypress with Page Object Model (POM) to ensure maintainable and reusable test code.

📁 Folder Structure
FLACRONCV/└── web-automation/
cypress/
 ├── e2e/
 │     ├── login.cy.js
 │     ├── signup.cy.js
 |     |-- skillsPageTest.cy.js
 │
 ├── pages/
 │     ├── loginPage.js
 │     ├── signupPage.js
 |     |--- skillsPage.cy
 Test Files Description


This is a comprehensive README structure for your FlacronCV automation project. It covers the technical stack, the logic behind your URL validation to prevent cascading failures, and the specific test coverage you've implemented.

FlacronCV Automation Suite (Cypress)
This repository contains a robust automation framework for the FlacronCV platform, focusing on the end-to-end flow of CV creation, template selection, and data validation.

🚀 Key Features & Logic
Self-Healing Session Logic: To prevent cascading failures (where one failed test causes all subsequent tests to fail due to session overlap), the suite uses strict URL validation and conditional routing. It checks the current state (/dashboard vs /login) before every test to ensure a clean start.

Dynamic Data Generation: Integration with the Faker library ensures that every test run uses unique, professional data (titles, summaries, personal info), simulating real user behavior.

Dynamic Template Selection: Tests do not hard-code template choices; they perform dynamic selection to verify different designs across different runs.

PDF/Docx Validation: Specialized logic using pdf-parse to verify the content of exported documents.

🛠 Tech Stack
Framework: Cypress

Language: JavaScript / TypeScript

Design Pattern: Page Object Model (POM)

Data: Faker.js

CI/CD: GitHub Actions

Reporting: Mochawesome / HTML Reports

📋 Test Coverage (13 Test Cases)
The suite validates the core "Create CV" engine, including:

Form Logic: Validation of all 13+ fields with dynamic data.

Media Handling: Upload and validation of valid/invalid profile images.

Export Functionality: Testing PDF and DOCX generation (content verification via tasks).

Dynamic UI:

Adding and removing Skills/Sections.

Validating "Hide Section" and "Delete Section" functionality.

Navigation: Testing Browser Back/Forward buttons and internal flow redirects.

Exclusions: Font rendering and UI design aesthetics are excluded from these functional tests.

⚙️ Installation & Setup
Clone the repository:

Bash
git clone https://github.com/[your-username]/flacroncv-create-cv.git
cd flacroncv-create-cv
Install dependencies:

Bash
npm install
Install PDF parsing library:

Bash
npm install pdf-parse --save-dev
Open Cypress UI:

Bash
npx cypress open
🤖 Running in GitHub Actions
You can trigger the automation suite manually via the Cloud:

Navigate to the Actions tab in the GitHub repository.

Select the Create CV Workflow from the left sidebar.

Click the Run workflow dropdown and select the branch.

Once the run is complete, scroll down to Artifacts to download the html folder containing the test results and screenshots of any failures.

📁 Project Structure
/cypress/e2e/: Contains the functional test scripts.

/cypress/pages/: Contains the POM classes (loginObj, templateObj, etc.).

/cypress/fixtures/: Static test data (like signUpData).

/cypress/downloads/: Temp folder for validated PDF/Docx files.

Author: HS (QA Automation Engineer)
