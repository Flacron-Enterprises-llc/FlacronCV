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
 │
 ├── pages/
 │     ├── loginPage.js
 │     ├── signupPage.js
 Test Files Description
1. login.cy.js

This file validates the Login functionality with different scenarios.

Covered Scenarios:

Valid login

Invalid login

Empty fields validation

Incorrect credentials validation

Login window UI validation

Error message validation

Each test uses a Login Page Object file to manage locators and reusable functions.

2. signup.cy.js

This file validates the Signup functionality for creating a new account.

Covered Scenarios:

Required fields validation

Valid account creation

Invalid email validation

Password validation

Field error messages validation

Form validation scenarios

Each test uses a Signup Page Object file to manage locators and reusable functions.

Framework Design

This project uses Page Object Model (POM).

Each test file has a corresponding Page Object file

Locators and reusable functions are stored in object files

Test files contain only test logic

Example:
login.cy.js → loginPage.js  
signup.cy.js → signupPage.js

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




