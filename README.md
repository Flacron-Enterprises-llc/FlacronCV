## Cypress Automation: My CV Page Testing

This repository contains the end-to-end (E2E) automation suite for the **My CV** page. The project is built using **Cypress** and follows a modular, scalable architecture to ensure high-quality web automation.

---

### 🚀 Automation Methodologies

Our testing strategy leverages industry-standard practices to ensure reliability and maintainability:

* **Page Object Model (POM):** We separate the test scripts (`mycv.cy.js`) from the page-specific locators and methods (`mycv.js`). This reduces code duplication and makes updates easier when the UI changes.
* **End-to-End (E2E) Testing:** We validate the entire user journey, starting from **Login** through complex CV management actions, ending with a secure **Logout**.
* **Functional & UI Testing:** Every test validates both the functional logic (e.g., records saving to the database) and UI elements (e.g., visibility of Tailwind-truncated titles and modal overlays).
* **Test Independence:** Each test case is designed to be **atomic and independent**. We use unique data (via `faker` or timestamps) to ensure that the failure of one test does not affect the execution of another.
* **Flake Resistance (Retries):** To handle network latency or environment instability, the suite is configured to **automatically re-run failed tests up to 2 times** before marking them as failed.

---

### 🛠 Project Structure

* **Test Script:** `cypress/e2e/mycv.cy.js` — Contains the actual test scenarios and assertions.
* **Page Object File:** `cypress/pages/mycv.js` — Contains the class `mycvObj` with all web locators and action methods (click, type, validate).

---

### 🧪 Test Coverage

The suite covers the following critical business flows:

#### 1. CV Creation & Editing
* **Flow:** Create a new CV → Navigate to the "My CV" page → Locate the card → Click the **Edit** button.
* **Validation:** Ensures the editor opens with the correct data and allows for updates.

#### 2. Duplication Logic (Data Integrity)
* **Flow:** Create a CV → Click the **Duplicate** button.
* **Validation:** Identifies the new card (usually named with a `(Copy)` suffix) and validates that all fields (Name, Email, Project details) were cloned correctly.

#### 3. Deletion & Confirmation Modal
* **Functional Check:** Create a CV → Click the **Delete** icon.
* **Modal Validation:** * **Cancel Action:** Clicks the "Cancel" button in the "Delete CV?" modal and verifies the CV remains on the page.
    * **Confirm Action:** Clicks the red "Delete" button and validates the "deleted successfully" toast message.
* **Negative Assertion:** Verifies the CV name no longer exists in the DOM after deletion.

#### 4. UI/UX Resilience
* Handles complex CSS scenarios such as **text truncation** and **hidden overflow** using specialized Cypress assertions (`exist` vs `be.visible`) and forced interactions where necessary.

---

### ⚙️ Configuration & Execution

**Retry Logic:**
Defined in `cypress.config.js` to handle environment flakes:
```javascript
{
  "retries": {
    "runMode": 2,
    "openMode": 0
  }
}
```

**How to Run:**
1.  **Install Dependencies:** `npm install`
2.  **Open Cypress UI:** `npx cypress open`
3.  **Headless Execution:** `npx cypress run --spec "cypress/e2e/mycv.cy.js"`

---

### 📝 Key Technical Highlights
* **Regex Matching:** Used for finding CV titles to avoid issues with extra spaces or truncated text.
* **Scoped Actions:** Utilizes `.within()` to interact specifically with one CV card in a grid of many.
* **Modal Portals:** Specifically handles the `fixed z-50` overlay layers for the Delete confirmation popup.
