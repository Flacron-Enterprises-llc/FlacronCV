// pages/TemplatePage.js
// Page Object Model for the FlacronCV Template Selection Page

class createNewCVPage {


  webselector= {

     confirmationMsg: 'section > ol > li',
     messageBox: 'section > ol > li',
     cvTitle: '[placeholder="e.g. Software Engineer CV 2025"]',
     alret: 'ol[dir="ltr"] li div div',

  }


  // ─── Selectors ───────────────────────────────────────────────────────────────

  validateConfirmationMsg(){


    cy.get(this.webselector.messageBox).should('be.visible');
   cy.get(this.webselector.confirmationMsg).should('have.text', 'CV created!')
  //  cy.get(this.webselector.confirmationMsg).should('have.text', 'CV limit reached for your plan. Please upgrade.')
   // cy.contains('CV created!').should('be.visible')
  
  }

  alertMsg(){

    cy.get(this.webselector.alret).should('have.text','Title is required')
  }

  enterCVTitle(title){

 
    cy.get(this.webselector.cvTitle).type(title)

  }
  validateGetStartedButton(){


    cy.contains('Get Started').click()
    cy.contains('Create New CV').should('be.visible')
  }

  validateMyCVFromSideMenu(){

    cy.contains('My CVs').click()
    cy.contains('My CVs').should('be.visible')
  }


  // The CV name input field at the top
  get cvNameInput() {
    return cy.get('input[placeholder="e.g. Software Engineer CV 2025"]');
  }

  // All template cards in the grid
  get allTemplateCards() {
    return cy.get('.grid button[type="button"]');
  }

  get templateButtons() {
        // Targets the button based on the provided HTML structure
        return cy.get('button.relative.rounded-xl');
    }

    selectRandomFreeTemplate() {
        cy.log('👉 Selecting a random FREE template');

        // 1. Find all buttons, then filter those that contain a span with "Free"
        this.templateButtons.filter(':has(span:contains("Free"))').then(($freeTemplates) => {
            // 2. Get the total count of free templates found
            const count = $freeTemplates.length;
            
            // 3. Generate a random index between 0 and (count - 1)
            const randomIndex = Math.floor(Math.random() * count);

            cy.log(`Found ${count} free templates. Picking index: ${randomIndex}`);

            // 4. Click the randomly chosen template
            cy.wrap($freeTemplates).eq(randomIndex).click();
        });
    }

    clickCreateCV() {
        cy.contains('button', 'Create CV').click();
    }

  // Only FREE template cards (not locked/Pro/Enterprise)
  get freeTemplateCards() {
    // Free templates have a green "Free" badge and are NOT dimmed with opacity-75
    return cy.get('.grid button[type="button"]').not('.opacity-75');
  }

  // The "Create CV" button
  get createCVButton() {
    return cy.get('button').contains('Create CV');
  }

  // The "Cancel" button
  get cancelButton() {
    return cy.get('button').contains('Cancel');
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Visit the CV creation page
   */
  visit() {
    cy.visit('/cv/new'); // Update URL path as needed
  }

  /**
   * Enter a name for the CV
   * @param {string} name
   */
  enterCVName(name) {
    this.cvNameInput.clear().type(name);
  }

  /**
   * Randomly select one FREE template each test run
   * Stores the selected template name as an alias @selectedTemplate
   */
  selectRandomFreeTemplate() {
    this.freeTemplateCards.then(($cards) => {
      const total = $cards.length;
      expect(total).to.be.greaterThan(0, 'There should be at least one free template');

      // Pick a random index each run
      const randomIndex = Math.floor(Math.random() * total);
      const selectedCard = $cards[randomIndex];

      // Save the template name for assertions later
      const templateName = Cypress.$(selectedCard).find('p.font-medium').text().trim();
      cy.wrap(templateName).as('selectedTemplate');
      cy.log(`Selected free template: "${templateName}" (index ${randomIndex})`);

      // Click the randomly selected free template card
      cy.wrap(selectedCard).click();
    });
  }

  /**
   * Select a specific template by name (e.g. "Classic")
   * @param {string} name
   */
  selectTemplateByName(name) {
    this.allTemplateCards
      .contains('p.font-medium', name)
      .parents('button')
      .click();
    cy.log(`Selected template: "${name}"`);
  }

  /**
   * Click the Create CV button to submit
   */
  clickCreateCV() {
    this.createCVButton.click();
  }

  /**
   * Click Cancel
   */
  clickCancel() {
    this.cancelButton.click();
  }

  // ─── Assertions ──────────────────────────────────────────────────────────────

  /**
   * Assert a template card is visually selected (highlighted border)
   * @param {string} templateName
   */
  verifyTemplateIsSelected(templateName) {
    this.allTemplateCards
      .contains('p.font-medium', templateName)
      .parents('button')
      .should('have.class', 'border-brand-500'); // Active selection class
  }

  /**
   * Assert locked templates show a lock icon and cannot be clicked freely
   */
  verifyLockedTemplatesExist() {
    cy.get('.grid button.opacity-75').should('exist');
    cy.get('.lucide-lock').should('be.visible');
  }

  /**
   * Assert the Free badge is visible on a card
   * @param {string} templateName
   */
  verifyFreeBadge(templateName) {
    this.allTemplateCards
      .contains('p.font-medium', templateName)
      .parents('button')
      .find('span')
      .contains('Free')
      .should('be.visible');
  }
}

export default createNewCVPage