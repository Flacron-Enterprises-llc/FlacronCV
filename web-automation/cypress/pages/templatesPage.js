class templatesPage {

  weblocators = {
    cvCards: '.rounded-xl',   // all CV cards
    useTemplateBtn: 'button:contains("Use Template")',
  
    
  }

  visitPage() {
    cy.visit('/templates'); // update URL if needed
  }


  clickCVTemplateTab(){

    cy.contains('CV Templates').click()
  }

  clickCoverLetterTemplate(){

    cy.contains('Cover Letter Templates').click()
  }

  clickRandomTemplate() {

    cy.get(this.weblocators.cvCards)
      .should('have.length.greaterThan', 0)
      .then(($cards) => {

        const randomIndex = Cypress._.random(0, $cards.length - 1);

        cy.wrap($cards[randomIndex])
          .scrollIntoView()
          .should('be.visible')
          .within(() => {
            cy.contains('button', 'Use Template').click();
          });

      });
  }

  validateRedirect() {
    cy.get('h1.text-2xl.font-bold.text-stone-900')
      .should('be.visible')
      .and('have.text', 'Create New CV');
  }

   validateRedirectCoverletterTem() {
    cy.get('h1.text-2xl.font-bold.text-stone-900')
      .should('be.visible')
      .and('have.text', 'Create New Cover Letter');
  }

}

export default templatesPage;